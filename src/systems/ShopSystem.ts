import {
  BlockTag,
  BlockType,
  SHOP_ITEM_POOL,
  SHOP_TAG_DEFENSE,
  SHOP_TAG_OFFENSE,
  SHOP_TAG_RESOURCE,
  SHOP_TAG_SPELL,
  ShopItem,
  SpellType,
} from '../config/blockTypes';
import { GameState } from '../core/GameState';
import {
  calculatePressureStoneCombatPower,
  createPlacedBlock,
  destroyBlockInContext,
  hasBlockTag,
  isFriendlyBlock,
  MAX_BLOCK_LEVEL,
  refreshBlockForLevel,
} from '../effects/BlockEffectRegistry';
import { createEffectContext } from '../effects/EffectContext';
import { dragonTakeDamage, markDragonDefeated } from '../models/Dragon';
import { EventBus } from '../core/EventBus';

export type ShopSectionKey = 'locked' | 'resource' | 'defense' | 'offense' | 'spell';
export type RefreshSectionKey = Exclude<ShopSectionKey, 'locked'>;

export const SHOP_SECTION_ORDER: ShopSectionKey[] = ['locked', 'resource', 'defense', 'offense', 'spell'];
export const SHOP_REFRESH_SECTION_ORDER: RefreshSectionKey[] = ['resource', 'defense', 'offense', 'spell'];
export const SHOP_SECTION_LABELS: Record<ShopSectionKey, string> = {
  locked: '锁定',
  resource: '资源',
  defense: '防御',
  offense: '进攻',
  spell: '法术',
};

export const SHOP_INITIAL_SECTION_SIZES: Record<ShopSectionKey, number> = {
  locked: 1,
  resource: 2,
  defense: 2,
  offense: 2,
  spell: 1,
};

export const SHOP_EXPANSION_BASE_COST = 50;
export const SHOP_EXPANSION_COST_STEP = 30;
export const SHOP_TOTAL_SLOT_LIMIT = 15;

const SECTION_TAGS: Record<RefreshSectionKey, string> = {
  resource: SHOP_TAG_RESOURCE,
  defense: SHOP_TAG_DEFENSE,
  offense: SHOP_TAG_OFFENSE,
  spell: SHOP_TAG_SPELL,
};

export interface ShopState {
  locked: (ShopItem | null)[];
  resource: (ShopItem | null)[];
  defense: (ShopItem | null)[];
  offense: (ShopItem | null)[];
  spell: (ShopItem | null)[];
  totalExpansions: number;
  totalSlots: number;
  maxTotalSlots: number;
  nextExpansionCost: number;
}

export interface ShopSelection {
  area: ShopSectionKey;
  index: number;
  item: ShopItem;
}

export interface PlacementResult {
  ok: boolean;
  message: string;
}

export class ShopSystem {
  readonly state: ShopState = this.createInitialState();

  private selection: ShopSelection | null = null;

  constructor() {
    this.refillAllRefreshSections();
  }

  reset(): void {
    const next = this.createInitialState();
    this.state.locked = next.locked;
    this.state.resource = next.resource;
    this.state.defense = next.defense;
    this.state.offense = next.offense;
    this.state.spell = next.spell;
    this.state.totalExpansions = 0;
    this.state.totalSlots = totalSlotCount(this.state);
    this.state.maxTotalSlots = SHOP_TOTAL_SLOT_LIMIT;
    this.state.nextExpansionCost = SHOP_EXPANSION_BASE_COST;
    this.selection = null;
    this.refillAllRefreshSections();
  }

  beginPlacementFromSection(section: ShopSectionKey, index: number, villagePower: number): PlacementResult {
    if (!this.isValidIndex(section, index)) return { ok: false, message: '未选择建筑' };
    const item = this.getSection(section)[index];
    if (!item) return { ok: false, message: '未选择建筑' };
    if (villagePower < item.cost) {
      this.selection = null;
      return { ok: false, message: '战力不足' };
    }
    this.selection = { area: section, index, item };
    return { ok: true, message: item.kind === 'spell' ? '选择法术目标' : '选择放置的扇区' };
  }

  beginPlacementFromLockedWithPower(lockedIndex: number, villagePower: number): PlacementResult {
    return this.beginPlacementFromSection('locked', lockedIndex, villagePower);
  }

  selectedItem(): ShopSelection | null {
    return this.selection;
  }

  cancelPlacement(): void {
    this.selection = null;
  }

  moveSectionItemToLocked(section: RefreshSectionKey, sourceIndex: number, lockedIndex: number): boolean {
    if (!this.isValidIndex(section, sourceIndex) || !this.isValidIndex('locked', lockedIndex)) return false;
    const sourceSlots = this.getSection(section);
    const item = sourceSlots[sourceIndex];
    if (!item) return false;
    this.state.locked[lockedIndex] = item;
    sourceSlots[sourceIndex] = null;
    this.refillSectionSlot(section, sourceIndex);
    return true;
  }

  tryExpandSection(gameState: GameState, section: ShopSectionKey): PlacementResult {
    if (this.state.totalSlots >= SHOP_TOTAL_SLOT_LIMIT) return { ok: false, message: '商店已达到扩展上限' };
    const cost = this.state.nextExpansionCost;
    if (gameState.board.villagePower < cost) return { ok: false, message: '战力不足' };

    this.getSection(section).push(null);
    this.state.totalExpansions += 1;
    this.updateStateMeta();
    gameState.applyVillagePowerDelta(-cost, 'placement');

    if (section !== 'locked') {
      this.refillSectionSlot(section, this.getSection(section).length - 1);
    }

    return { ok: true, message: `${SHOP_SECTION_LABELS[section]}区扩展成功` };
  }

  canExpandSection(section: ShopSectionKey): boolean {
    void section;
    return this.state.totalSlots < SHOP_TOTAL_SLOT_LIMIT;
  }

  tryPlaceSelectedItem(gameState: GameState, sector: number | null): PlacementResult {
    const selected = this.selectedItem();
    const item = selected?.item;
    if (!selected || !item) return { ok: false, message: '未选择建筑' };
    if (gameState.board.villagePower < item.cost) return { ok: false, message: '战力不足' };
    if (sector === null && !(item.kind === 'spell' && item.spellType === SpellType.BULWARK)) {
      return { ok: false, message: '请选择棋盘格' };
    }

    const result = item.kind === 'spell'
      ? this.castSelectedSpell(gameState, selected, sector)
      : this.placeSelectedBlock(gameState, selected, sector);

    if (!result.ok) return result;
    gameState.applyVillagePowerDelta(-item.cost, 'placement');
    this.consumeSelection(selected);
    return result;
  }

  private placeSelectedBlock(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'block') return { ok: false, message: '未选择建筑' };
    if (sector === null) return { ok: false, message: '请选择棋盘格' };
    const existing = gameState.board.getSector(sector);
    if (existing?.type === BlockType.DRAGON_FIRE) {
      existing.combatPower -= item.combatPower;
      if (existing.combatPower <= 0) gameState.board.removeBlock(sector);
      return { ok: true, message: '建筑化解了龙焰' };
    }
    if (existing && existing.type !== item.blockType) return { ok: false, message: '该格已有其他建筑' };
    if (existing && existing.level >= MAX_BLOCK_LEVEL) return { ok: false, message: '该建筑已满级' };
    let target = existing;
    if (existing) {
      refreshBlockForLevel(existing, existing.level + 1);
    } else {
      const block = this.createPlacedBlockWithPlacementEffects(gameState, item.blockType, item.combatPower, sector);
      gameState.board.setSector(sector, block);
      target = block;
    }
    if (target && isFriendlyBlock(target)) target.combatPower += this.applyPlacementSmithyBonus(gameState, sector);
    return { ok: true, message: existing ? `建筑已升级至 Lv.${existing.level}` : '建筑已放置' };
  }

  private castSelectedSpell(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'spell') return { ok: false, message: '未选择法术' };
    if (item.spellType === SpellType.BULWARK) return this.castBulwark(gameState);
    if (sector === null) return { ok: false, message: '请选择法术目标' };
    if (item.spellType === SpellType.FOCUS_FIELD) return this.castFocusField(gameState, sector);
    if (item.spellType === SpellType.SACRIFICE) return this.castSacrifice(gameState, sector);
    if (item.spellType === SpellType.SHIELD_CRUSH) return this.castShieldCrush(gameState, sector);
    return { ok: false, message: '未知法术' };
  }

  private castFocusField(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target)) return { ok: false, message: '请选择友方建筑/单位' };
    let absorbed = 0;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const source = gameState.board.getSector(adjacent);
      if (!isFriendlyBlock(source)) continue;
      const amount = Math.floor(source.combatPower / 2);
      if (amount <= 0) continue;
      source.combatPower -= amount;
      absorbed += amount;
    }
    if (absorbed <= 0) return { ok: false, message: '没有可吸收的相邻战力' };
    target.combatPower += absorbed;
    return { ok: true, message: `集中力场吸收 ${absorbed} 战力` };
  }

  private castSacrifice(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target)) return { ok: false, message: '请选择友方建筑/单位' };
    const candidates = gameState.board.findAllSectors((block, index) => index !== sector && isFriendlyBlock(block) && block.level < MAX_BLOCK_LEVEL);
    if (candidates.length === 0) return { ok: false, message: '没有可升级的其他友方' };
    const upgradeSector = candidates[Math.floor(Math.random() * candidates.length)];
    const upgradeTarget = gameState.board.getSector(upgradeSector);
    if (!upgradeTarget) return { ok: false, message: '没有可升级的其他友方' };
    destroyBlockInContext(target, sector, createEffectContext(gameState), target.combatPower);
    refreshBlockForLevel(upgradeTarget, upgradeTarget.level + 1);
    return { ok: true, message: `${upgradeTarget.type} 升级至 Lv.${upgradeTarget.level}` };
  }

  private castBulwark(gameState: GameState): PlacementResult {
    let affected = 0;
    gameState.board.forEach((block) => {
      if (!isFriendlyBlock(block) || !hasBlockTag(block, BlockTag.UNABLE_TO_ATTACK)) return;
      block.combatPower += 5;
      affected++;
    });
    if (affected === 0) return { ok: false, message: '没有可强化的目标' };
    return { ok: true, message: `壁垒强化 ${affected} 个目标` };
  }

  private castShieldCrush(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target) || !hasBlockTag(target, BlockTag.UNABLE_TO_ATTACK)) {
      return { ok: false, message: '请选择友方【无法攻击】建筑/单位' };
    }
    const dragon = gameState.aliveDragons.find(d => d.edgeIndex === sector);
    if (!dragon) return { ok: false, message: '该扇区没有敌人' };
    const damage = target.combatPower;
    destroyBlockInContext(target, sector, createEffectContext(gameState), target.combatPower);
    dragonTakeDamage(dragon, damage);
    EventBus.emit('dragonDamaged', { dragonId: dragon.id, damage });
    if (dragon.combatPower <= 0) {
      markDragonDefeated(dragon, gameState.turnNumber + 6);
      EventBus.emit('dragonDied', { dragonId: dragon.id });
    }
    return { ok: true, message: `盾牌碾压造成 ${damage} 伤害` };
  }

  private consumeSelection(selected: ShopSelection): void {
    if (selected.area !== 'locked') {
      this.getSection(selected.area)[selected.index] = null;
      this.refillSectionSlot(selected.area, selected.index);
    }
    this.cancelPlacement();
  }

  private createInitialState(): ShopState {
    return {
      locked: new Array(SHOP_INITIAL_SECTION_SIZES.locked).fill(null),
      resource: new Array(SHOP_INITIAL_SECTION_SIZES.resource).fill(null),
      defense: new Array(SHOP_INITIAL_SECTION_SIZES.defense).fill(null),
      offense: new Array(SHOP_INITIAL_SECTION_SIZES.offense).fill(null),
      spell: new Array(SHOP_INITIAL_SECTION_SIZES.spell).fill(null),
      totalExpansions: 0,
      totalSlots: Object.values(SHOP_INITIAL_SECTION_SIZES).reduce((sum, count) => sum + count, 0),
      maxTotalSlots: SHOP_TOTAL_SLOT_LIMIT,
      nextExpansionCost: SHOP_EXPANSION_BASE_COST,
    };
  }

  private refillAllRefreshSections(): void {
    for (const section of SHOP_REFRESH_SECTION_ORDER) {
      const slots = this.getSection(section);
      for (let index = 0; index < slots.length; index++) {
        if (slots[index] === null) this.refillSectionSlot(section, index);
      }
    }
    this.updateStateMeta();
  }

  private refillSectionSlot(section: RefreshSectionKey, index: number): void {
    const slots = this.getSection(section);
    if (index < 0 || index >= slots.length) return;
    const available = this.getAvailableItemsForSection(section);
    slots[index] = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : null;
    this.updateStateMeta();
  }

  private getAvailableItemsForSection(section: RefreshSectionKey): ShopItem[] {
    const used = new Set<string>(this.getAllVisibleItems().map(item => item.id));
    return SHOP_ITEM_POOL.filter(item => item.tags.includes(SECTION_TAGS[section]) && !used.has(item.id));
  }

  private getAllVisibleItems(): ShopItem[] {
    const visible: ShopItem[] = [];
    for (const section of SHOP_SECTION_ORDER) {
      for (const item of this.getSection(section)) {
        if (item) visible.push(item);
      }
    }
    return visible;
  }

  private createPlacedBlockWithPlacementEffects(gameState: GameState, blockType: BlockType, combatPower: number, sector: number) {
    const block = createPlacedBlock(blockType, 1);
    if (blockType === BlockType.PRESSURE_STONE) {
      block.combatPower = calculatePressureStoneCombatPower(1, sector, gameState.aliveDragons);
      return block;
    }
    block.combatPower = combatPower;
    return block;
  }

  private applyPlacementSmithyBonus(gameState: GameState, sector: number): number {
    let totalBonus = 0;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const block = gameState.board.getSector(adjacent);
      if (block?.type !== BlockType.SMITHY) continue;
      const currentBonus = block.smithyPlacementBonus ?? 1;
      totalBonus += currentBonus;
      block.smithyPlacementBonus = currentBonus + 1;
    }
    return totalBonus;
  }

  private getSection(section: ShopSectionKey): (ShopItem | null)[] {
    return this.state[section];
  }

  private isValidIndex(section: ShopSectionKey, index: number): boolean {
    return index >= 0 && index < this.getSection(section).length;
  }

  private updateStateMeta(): void {
    this.state.totalSlots = totalSlotCount(this.state);
    this.state.maxTotalSlots = SHOP_TOTAL_SLOT_LIMIT;
    this.state.nextExpansionCost = SHOP_EXPANSION_BASE_COST + this.state.totalExpansions * SHOP_EXPANSION_COST_STEP;
  }
}

function totalSlotCount(state: Pick<ShopState, ShopSectionKey>): number {
  return SHOP_SECTION_ORDER.reduce((sum, section) => sum + state[section].length, 0);
}

// Keep a shared constant for imports that already expect it in config-like form.
export { SHOP_TOTAL_SLOT_LIMIT as SHOP_MAX_TOTAL_SLOTS };
