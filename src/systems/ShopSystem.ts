import { BlockTag, BlockType, SHOP_ITEM_POOL, ShopItem, SpellType } from '../config/blockTypes';
import { GameState } from '../core/GameState';
import { createPlacedBlock, hasBlockTag, isFriendlyBlock, MAX_BLOCK_LEVEL, refreshBlockForLevel } from '../effects/BlockEffectRegistry';
import { dragonTakeDamage } from '../models/Dragon';
import { EventBus } from '../core/EventBus';

export const LOCKED_SLOT_COUNT = 2;
export const OFFER_SLOT_COUNT = 5;

export interface ShopState {
  lockedSlots: (ShopItem | null)[];
  offerSlots: (ShopItem | null)[];
}

export interface ShopSelection {
  area: 'locked' | 'offer';
  index: number;
  item: ShopItem;
}

export interface PlacementResult {
  ok: boolean;
  message: string;
}

export class ShopSystem {
  readonly state: ShopState = {
    lockedSlots: new Array(LOCKED_SLOT_COUNT).fill(null),
    offerSlots: new Array(OFFER_SLOT_COUNT).fill(null),
  };

  private selection: ShopSelection | null = null;

  constructor() {
    this.refreshOffers();
  }

  reset(): void {
    this.state.lockedSlots = new Array(LOCKED_SLOT_COUNT).fill(null);
    this.state.offerSlots = new Array(OFFER_SLOT_COUNT).fill(null);
    this.selection = null;
    this.refreshOffers();
  }

  refreshOffers(): void {
    const used = new Set<string>();
    for (const item of [...this.state.lockedSlots, ...this.state.offerSlots]) {
      if (item) used.add(item.id);
    }
    const available = SHOP_ITEM_POOL.filter(item => !used.has(item.id));
    const next: (ShopItem | null)[] = [];
    for (let i = 0; i < OFFER_SLOT_COUNT && available.length > 0; i++) {
      const index = Math.floor(Math.random() * available.length);
      next.push(available.splice(index, 1)[0]);
    }
    while (next.length < OFFER_SLOT_COUNT) next.push(null);
    this.state.offerSlots = next;
  }

  refillOfferSlot(index: number): void {
    if (!this.isOfferIndex(index)) return;
    const used = new Set<string>();
    for (const item of [...this.state.lockedSlots, ...this.state.offerSlots]) {
      if (item) used.add(item.id);
    }
    const available = SHOP_ITEM_POOL.filter(item => !used.has(item.id));
    this.state.offerSlots[index] = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : null;
  }

  moveOfferToLocked(offerIndex: number, lockedIndex: number): boolean {
    const offer = this.state.offerSlots[offerIndex];
    if (!offer || !this.isOfferIndex(offerIndex) || !this.isLockedIndex(lockedIndex)) return false;
    const locked = this.state.lockedSlots[lockedIndex];
    this.state.lockedSlots[lockedIndex] = offer;
    this.state.offerSlots[offerIndex] = locked;
    return true;
  }

  beginPlacementFromOffer(offerIndex: number, villagePower: number): PlacementResult {
    if (!this.isOfferIndex(offerIndex)) return { ok: false, message: '未选择建筑' };
    const item = this.state.offerSlots[offerIndex];
    if (!item) return { ok: false, message: '未选择建筑' };
    if (villagePower < item.cost) {
      this.selection = null;
      return { ok: false, message: '战力不足' };
    }
    this.selection = { area: 'offer', index: offerIndex, item };
    return { ok: true, message: item.kind === 'spell' ? '选择法术目标' : '选择放置的扇区' };
  }

  beginPlacementFromLockedWithPower(lockedIndex: number, villagePower: number): PlacementResult {
    if (!this.isLockedIndex(lockedIndex)) return { ok: false, message: '未选择建筑' };
    const item = this.state.lockedSlots[lockedIndex];
    if (!item) return { ok: false, message: '未选择建筑' };
    if (villagePower < item.cost) {
      this.selection = null;
      return { ok: false, message: '战力不足' };
    }
    this.selection = { area: 'locked', index: lockedIndex, item };
    return { ok: true, message: item.kind === 'spell' ? '选择法术目标' : '选择放置的扇区' };
  }

  selectedItem(): ShopSelection | null {
    return this.selection;
  }

  cancelPlacement(): void {
    this.selection = null;
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
    gameState.board.villagePower -= item.cost;
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
    if (existing) {
      refreshBlockForLevel(existing, existing.level + 1);
    } else {
      const block = createPlacedBlock(item.blockType, 1);
      block.combatPower = item.combatPower;
      gameState.board.setSector(sector, block);
    }
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
    gameState.board.removeBlock(sector);
    EventBus.emit('blockDestroyed', { sector, blockType: target.type, combatPower: target.combatPower });
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
    gameState.board.removeBlock(sector);
    EventBus.emit('blockDestroyed', { sector, blockType: target.type, combatPower: target.combatPower });
    dragonTakeDamage(dragon, damage);
    EventBus.emit('dragonDamaged', { dragonId: dragon.id, damage });
    if (!dragon.isAlive) EventBus.emit('dragonDied', { dragonId: dragon.id });
    return { ok: true, message: `盾牌碾压造成 ${damage} 伤害` };
  }

  private consumeSelection(selected: ShopSelection): void {
    if (selected.area === 'offer') this.refillOfferSlot(selected.index);
    this.cancelPlacement();
  }

  private isOfferIndex(index: number): boolean {
    return index >= 0 && index < this.state.offerSlots.length;
  }

  private isLockedIndex(index: number): boolean {
    return index >= 0 && index < this.state.lockedSlots.length;
  }
}
