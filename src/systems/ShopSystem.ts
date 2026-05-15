import {
  BASE_SHOP_ITEMS,
  BlockType,
  RANDOM_SHOP_POOL,
  ShopItem,
  SpellType,
} from '../config/blockTypes';
import { GameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import {
  createPlacedBlock,
  createPlacedPressureStone,
  damageBlockInContext,
  damageDragon,
  destroyBlockInContext,
  getBlockAttack,
  isEnemyBlock,
  isFriendlyBlock,
} from '../effects/BlockEffectRegistry';
import { createEffectContext } from '../effects/EffectContext';
import { BlockData } from '../models/Block';

export type ShopSectionKey = 'base' | 'random';

export interface RandomShopSlot {
  item: ShopItem | null;
  locked: boolean;
}

export interface ShopState {
  base: ShopItem[];
  random: RandomShopSlot[];
  refreshCost: number;
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

const RANDOM_SLOT_COUNT = 4;
const INITIAL_REFRESH_COST = 1;
const REFRESH_COST_STEP = 2;

export class ShopSystem {
  readonly state: ShopState = this.createInitialState();

  private selection: ShopSelection | null = null;

  constructor() {
    this.refillRandomSlots();
  }

  reset(): void {
    const next = this.createInitialState();
    this.state.base = next.base;
    this.state.random = next.random;
    this.state.refreshCost = INITIAL_REFRESH_COST;
    this.selection = null;
    this.refillRandomSlots();
  }

  beginNewTurn(): void {
    this.state.refreshCost = INITIAL_REFRESH_COST;
  }

  beginPlacementFromSection(section: ShopSectionKey, index: number, villageGold: number): PlacementResult {
    if (!this.isValidIndex(section, index)) return { ok: false, message: '未选择商品' };
    const item = this.getItem(section, index);
    if (!item) return { ok: false, message: '未选择商品' };
    if (villageGold < item.cost) {
      this.selection = null;
      return { ok: false, message: '金币不足' };
    }
    this.selection = { area: section, index, item };
    return { ok: true, message: item.kind === 'spell' ? '选择法术目标' : '选择放置的扇区' };
  }

  selectedItem(): ShopSelection | null {
    return this.selection;
  }

  cancelPlacement(): void {
    this.selection = null;
  }

  toggleRandomLock(index: number): PlacementResult {
    if (index < 0 || index >= this.state.random.length) return { ok: false, message: '未选择随机商品' };
    const slot = this.state.random[index];
    if (!slot.item) return { ok: false, message: '空槽无法锁定' };
    slot.locked = !slot.locked;
    return { ok: true, message: slot.locked ? '商品已锁定' : '商品已解锁' };
  }

  refreshRandom(gameState: GameState): PlacementResult {
    const cost = this.state.refreshCost;
    if (gameState.board.villageGold < cost) return { ok: false, message: '金币不足' };
    gameState.applyVillageGoldDelta(-cost);
    this.state.refreshCost += REFRESH_COST_STEP;
    for (const slot of this.state.random) {
      if (!slot.locked) slot.item = null;
    }
    this.refillRandomSlots();
    this.selection = null;
    return { ok: true, message: `刷新消耗 ${cost} 金币` };
  }

  tryPlaceSelectedItem(gameState: GameState, sector: number | null): PlacementResult {
    const selected = this.selectedItem();
    const item = selected?.item;
    if (!selected || !item) return { ok: false, message: '未选择商品' };
    if (gameState.board.villageGold < item.cost) return { ok: false, message: '金币不足' };
    if (sector === null && item.kind !== 'spell') return { ok: false, message: '请选择棋盘格' };

    const result = item.kind === 'spell'
      ? this.castSelectedSpell(gameState, selected, sector)
      : this.placeSelectedBlock(gameState, selected, sector);

    if (!result.ok) return result;
    gameState.applyVillageGoldDelta(-item.cost);
    this.consumeSelection(selected);
    return result;
  }

  private placeSelectedBlock(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'block') return { ok: false, message: '未选择建筑' };
    if (sector === null) return { ok: false, message: '请选择棋盘格' };
    const ctx = createEffectContext(gameState);
    const existing = gameState.board.getSector(sector);
    if (existing?.type === BlockType.DRAGON_FIRE) {
      damageBlockInContext(existing, sector, item.hp, ctx, { spell: 'placement' });
      return { ok: true, message: '建筑削减了龙焰' };
    }
    if (existing) return { ok: false, message: '该格已有地块' };
    if (item.blockType === BlockType.SENSING_WALL && gameState.board.findSector(block => block?.type === BlockType.SENSING_WALL) !== null) {
      return { ok: false, message: '最多只能存在 1 个感应石墙' };
    }

    const block = item.blockType === BlockType.PRESSURE_STONE
      ? createPlacedPressureStone(sector, gameState.aliveDragons)
      : createPlacedBlock(item.blockType);
    gameState.board.setSector(sector, block);
    this.applyPlacementSmithyBonus(gameState, sector, block);
    EventBus.emit('blockCreated', { sector, blockType: item.blockType, source: 'shop' });
    EventBus.emit('blockPlaced', { sector, blockType: item.blockType });
    return { ok: true, message: '建筑已放置' };
  }

  private castSelectedSpell(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'spell') return { ok: false, message: '未选择法术' };
    if (item.spellType === SpellType.BULWARK) return this.castBulwark(gameState);
    if (sector === null) return { ok: false, message: '请选择法术目标' };
    if (item.spellType === SpellType.MISSILE) return this.castMissile(gameState, sector);
    if (item.spellType === SpellType.FOCUS_DEFENSE) return this.castFocusDefense(gameState, sector);
    if (item.spellType === SpellType.FOCUS_BREAKTHROUGH) return this.castFocusBreakthrough(gameState, sector);
    if (item.spellType === SpellType.SACRIFICE) return this.castSacrifice(gameState, sector);
    if (item.spellType === SpellType.SHIELD_CRUSH) return this.castShieldCrush(gameState, sector);
    return { ok: false, message: '未知法术' };
  }

  private castMissile(gameState: GameState, sector: number): PlacementResult {
    const ctx = createEffectContext(gameState);
    const { bonusDamage, missileExtraHits } = this.getMageSpellBonus(gameState);
    const damage = 5 + bonusDamage;
    const hits = 1 + missileExtraHits;
    const dragon = gameState.aliveDragons.find(d => d.edgeIndex === sector);
    const block = gameState.board.getSector(sector);
    if (!dragon && !block) return { ok: false, message: '该扇区没有目标' };

    for (let i = 0; i < hits; i++) {
      const currentDragon = gameState.aliveDragons.find(d => d.id === dragon?.id && d.edgeIndex === sector);
      const currentBlock = gameState.board.getSector(sector);
      if (currentDragon) damageDragon(currentDragon, damage, ctx, `飞弹对 ${currentDragon.name} 造成 ${damage} 伤害`);
      else if (currentBlock) damageBlockInContext(currentBlock, sector, damage, ctx, { spell: 'missile' });
      else break;
    }
    return { ok: true, message: `飞弹造成 ${damage} 伤害 x${hits}` };
  }

  private castFocusDefense(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target)) return { ok: false, message: '请选择友方建筑/单位' };
    let absorbed = 0;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const source = gameState.board.getSector(adjacent);
      if (!isFriendlyBlock(source)) continue;
      const amount = Math.floor(source.hp / 2);
      if (amount <= 0) continue;
      source.hp -= amount;
      absorbed += amount;
    }
    if (absorbed <= 0) return { ok: false, message: '没有可吸收的相邻 HP' };
    target.hp += absorbed;
    return { ok: true, message: `集中防御吸收 ${absorbed} HP` };
  }

  private castFocusBreakthrough(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target)) return { ok: false, message: '请选择友方建筑/单位' };
    let absorbed = 0;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const source = gameState.board.getSector(adjacent);
      if (!isFriendlyBlock(source)) continue;
      const amount = Math.floor(source.attack / 2);
      if (amount <= 0) continue;
      source.attack -= amount;
      absorbed += amount;
    }
    if (absorbed <= 0) return { ok: false, message: '没有可吸收的相邻攻击力' };
    target.attack += absorbed;
    return { ok: true, message: `集中突破吸收 ${absorbed} 攻击力` };
  }

  private castSacrifice(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target)) return { ok: false, message: '请选择友方建筑/单位' };
    const candidates = gameState.board.findAllSectors((block, index) => index !== sector && isFriendlyBlock(block));
    if (candidates.length === 0) return { ok: false, message: '没有可传递的其他友方' };
    const receiverSector = candidates[Math.floor(Math.random() * candidates.length)];
    const receiver = gameState.board.getSector(receiverSector);
    if (!receiver) return { ok: false, message: '没有可传递的其他友方' };
    const hp = Math.floor(target.hp / 2);
    const attack = Math.floor(target.attack / 2);
    destroyBlockInContext(target, sector, createEffectContext(gameState), { spell: 'sacrifice' });
    receiver.hp += hp;
    receiver.attack += attack;
    return { ok: true, message: `献祭传递 ${hp} HP / ${attack} 攻击` };
  }

  private castBulwark(gameState: GameState): PlacementResult {
    let affected = 0;
    gameState.board.forEach((block) => {
      if (!isFriendlyBlock(block) || block.attack !== 0) return;
      block.hp += 5;
      affected++;
    });
    if (affected === 0) return { ok: false, message: '没有可强化的目标' };
    return { ok: true, message: `壁垒强化 ${affected} 个目标` };
  }

  private castShieldCrush(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target) || target.attack !== 0) return { ok: false, message: '请选择攻击力为 0 的友方' };
    const damage = target.hp + this.getMageSpellBonus(gameState).bonusDamage;
    const ctx = createEffectContext(gameState);
    const dragon = gameState.aliveDragons.find(d => d.edgeIndex === sector);
    const enemyBlock = gameState.board.getSector(sector);
    if (!dragon && !isEnemyBlock(enemyBlock)) return { ok: false, message: '该扇区没有敌人' };
    destroyBlockInContext(target, sector, ctx, { spell: 'shield_crush' });
    if (dragon) damageDragon(dragon, damage, ctx, `盾牌碾压对 ${dragon.name} 造成 ${damage} 伤害`);
    else if (isEnemyBlock(enemyBlock)) damageBlockInContext(enemyBlock, sector, damage, ctx, { spell: 'shield_crush' });
    return { ok: true, message: `盾牌碾压造成 ${damage} 伤害` };
  }

  private consumeSelection(selected: ShopSelection): void {
    if (selected.area === 'random' && !this.state.random[selected.index].locked) {
      this.state.random[selected.index].item = null;
      this.refillRandomSlots();
    }
    this.cancelPlacement();
  }

  private createInitialState(): ShopState {
    return {
      base: [...BASE_SHOP_ITEMS],
      random: Array.from({ length: RANDOM_SLOT_COUNT }, () => ({ item: null, locked: false })),
      refreshCost: INITIAL_REFRESH_COST,
    };
  }

  private refillRandomSlots(): void {
    for (let index = 0; index < this.state.random.length; index++) {
      const slot = this.state.random[index];
      if (slot.locked || slot.item) continue;
      const available = this.getAvailableRandomItems();
      slot.item = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null;
    }
  }

  private getAvailableRandomItems(): ShopItem[] {
    const used = new Set(this.state.random.map(slot => slot.item?.id).filter((id): id is string => Boolean(id)));
    return RANDOM_SHOP_POOL.filter(item => !used.has(item.id));
  }

  private getItem(section: ShopSectionKey, index: number): ShopItem | null {
    if (section === 'base') return this.state.base[index] ?? null;
    return this.state.random[index]?.item ?? null;
  }

  private isValidIndex(section: ShopSectionKey, index: number): boolean {
    if (section === 'base') return index >= 0 && index < this.state.base.length;
    return index >= 0 && index < this.state.random.length;
  }

  private applyPlacementSmithyBonus(gameState: GameState, sector: number, block: BlockData): void {
    if (!isFriendlyBlock(block)) return;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const smithy = gameState.board.getSector(adjacent);
      if (smithy?.type !== BlockType.SMITHY) continue;
      block.attack += getBlockAttack(smithy, createEffectContext(gameState), adjacent);
      smithy.attack += 1;
    }
  }

  private getMageSpellBonus(gameState: GameState): { bonusDamage: number; missileExtraHits: number } {
    let bonusDamage = 0;
    let missileExtraHits = 0;
    gameState.board.forEach((block, sector) => {
      if (block?.type !== BlockType.MAGE) return;
      bonusDamage += getBlockAttack(block, createEffectContext(gameState), sector);
      missileExtraHits++;
    });
    return { bonusDamage, missileExtraHits };
  }
}
