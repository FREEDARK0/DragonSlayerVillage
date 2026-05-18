import {
  ITEM_DATA_BY_ID,
  BASE_SHOP_ITEMS,
  BlockType,
  RANDOM_SHOP_POOL,
  SHOP_ITEM_POOL,
  ShopActionType,
  ShopItem,
  SpellShopItem,
  SpellType,
  cloneShopItem,
} from '../config/blockTypes';
import { GameState } from '../core/GameState';
import { EventBus } from '../core/EventBus';
import {
  createPlacedBlock,
  createPlacedPressureStone,
  damageBlockInContext,
  damageDragon,
  destroyBlockInContext,
  findDragonAtBoardSector,
  getBlockAttack,
  isEnemyBlock,
  isFriendlyBlock,
} from '../effects/BlockEffectRegistry';
import { createEffectContext } from '../effects/EffectContext';
import { BlockData } from '../models/Block';
import { resolveSellReward, runAfterSell, runBeforeSell, SellContext } from './SellEffectRegistry';
import { RelicId, RelicSystem } from './RelicSystem';
import { markDragonDeparted } from '../models/Dragon';
import { defaultRandomSource, RandomSource } from '../utils/random';

export type ShopSectionKey = 'base' | 'random' | 'temporary';

export interface RandomShopSlot {
  item: ShopItem | null;
  locked: boolean;
}

export interface ShopState {
  base: ShopItem[];
  random: RandomShopSlot[];
  temporary: ShopItem[];
  refreshCost: number;
  freeRefreshCredits: number;
  nextPurchaseDiscount: number;
}

export interface ShopSelection {
  area: ShopSectionKey;
  index: number;
  item: ShopItem;
  debug?: boolean;
  freePurchase?: boolean;
}

export interface ShopCombatStats {
  missileDamage: number;
}

export interface PlacementResult {
  ok: boolean;
  message: string;
  feedback?: {
    sector: number;
    text: string;
    color?: number;
  };
}

export type ShopTargetIntent = 'block' | 'dragon';

const RANDOM_SLOT_COUNT = 4;
const INITIAL_REFRESH_COST = 1;
const REFRESH_COST_STEP = 2;

export class ShopSystem {
  readonly state: ShopState = this.createInitialState();

  private selection: ShopSelection | null = null;

  constructor(private random: RandomSource = defaultRandomSource) {
    this.refillRandomSlots();
  }

  reset(): void {
    const next = this.createInitialState();
    this.state.base = next.base;
    this.state.random = next.random;
    this.state.temporary = next.temporary;
    this.state.refreshCost = INITIAL_REFRESH_COST;
    this.state.freeRefreshCredits = 0;
    this.state.nextPurchaseDiscount = 0;
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
    if (villageGold < this.effectiveCost(item)) {
      this.selection = null;
      return { ok: false, message: '金币不足' };
    }
    this.selection = { area: section, index, item };
    return { ok: true, message: selectionMessage(item) };
  }

  beginDebugPurchase(item: ShopItem, villageGold: number, freePurchase: boolean): PlacementResult {
    const selectedItem = cloneShopItem(item);
    const cost = freePurchase ? 0 : this.effectiveCost(selectedItem);
    if (villageGold < cost) {
      this.selection = null;
      return { ok: false, message: '金币不足' };
    }
    this.selection = { area: 'temporary', index: -1, item: selectedItem, debug: true, freePurchase };
    return { ok: true, message: selectionMessage(selectedItem) };
  }

  selectedItem(): ShopSelection | null {
    return this.selection;
  }

  getCombatStats(_gameState?: GameState): ShopCombatStats {
    return { missileDamage: this.currentMissileDamage() };
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
    if (this.state.freeRefreshCredits > 0) {
      this.state.freeRefreshCredits--;
      for (const slot of this.state.random) {
        if (!slot.locked) slot.item = null;
      }
      this.refillRandomSlots();
      this.selection = null;
      return { ok: true, message: '免费刷新随机区' };
    }
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

  tryPlaceSelectedItem(gameState: GameState, sector: number | null, targetIntent: ShopTargetIntent = 'block'): PlacementResult {
    const selected = this.selectedItem();
    const item = selected?.item;
    if (!selected || !item) return { ok: false, message: '未选择商品' };
    const cost = selected.freePurchase ? 0 : this.effectiveCost(item);
    const hadDiscountBeforePurchase = !selected.debug && this.state.nextPurchaseDiscount > 0;
    if (gameState.board.villageGold < cost) return { ok: false, message: '金币不足' };
    if (sector === null && item.kind !== 'spell') return { ok: false, message: item.kind === 'action' ? '请选择出售目标' : '请选择棋盘格' };

    const result = item.kind === 'spell'
      ? this.castSelectedSpell(gameState, selected, sector, targetIntent)
      : item.kind === 'action'
        ? this.performSelectedAction(gameState, selected, sector)
        : this.placeSelectedBlock(gameState, selected, sector);

    if (!result.ok) return result;
    gameState.applyVillageGoldDelta(-cost);
    if (item.kind !== 'action' && hadDiscountBeforePurchase) this.state.nextPurchaseDiscount = 0;
    this.consumeSelection(selected);
    return result;
  }

  private performSelectedAction(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'action') return { ok: false, message: '未选择操作' };
    if (item.actionType === ShopActionType.SELL) return this.sellSelectedBlock(gameState, selected, sector);
    return { ok: false, message: '未知操作' };
  }

  private sellSelectedBlock(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'action' || item.actionType !== ShopActionType.SELL) return { ok: false, message: '未选择出售操作' };
    if (sector === null) return { ok: false, message: '请选择出售目标' };
    const block = gameState.board.getSector(sector);
    if (!isFriendlyBlock(block)) {
      return {
        ok: false,
        message: '只能出售友方建筑/单位',
        feedback: { sector, text: '无法出售', color: 0xff5a5a },
      };
    }

    const ctx: SellContext = {
      state: gameState,
      board: gameState.board,
      sector,
      block,
      baseReward: item.baseReward,
      reward: item.baseReward,
      messages: [],
      events: EventBus,
    };
    resolveSellReward(ctx);
    runBeforeSell(ctx);
    gameState.board.removeBlock(sector);
    gameState.applyVillageGoldDelta(ctx.reward);
    EventBus.emit('blockSold', { sector, blockType: block.type, reward: ctx.reward });
    RelicSystem.onAfterSell(ctx, itemId => this.addTemporaryCopyIfMissing(itemId));
    runAfterSell(ctx);
    for (const message of ctx.messages) gameState.addMessage(message);
    return { ok: true, message: `出售获得 ${ctx.reward} 金币` };
  }

  private placeSelectedBlock(gameState: GameState, selected: ShopSelection, sector: number | null): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'block') return { ok: false, message: '未选择建筑' };
    if (sector === null) return { ok: false, message: '请选择棋盘格' };
    const ctx = this.createShopEffectContext(gameState);
    const existing = gameState.board.getSector(sector);
    if (existing?.type === BlockType.DRAGON_FIRE) {
      damageBlockInContext(existing, sector, this.effectivePlacedBlockHp(gameState, item), ctx, { spell: 'placement' });
      return { ok: true, message: '建筑削减了龙焰' };
    }
    if (
      item.blockType === BlockType.WOOD_WALL
      && existing
      && isFriendlyBlock(existing)
      && RelicSystem.has(gameState, RelicId.WOOD_WALL_NIGHT_STACK)
      && gameState.isNight(sector)
    ) {
      existing.hp += this.effectivePlacedBlockHp(gameState, item);
      return { ok: true, message: '木墙加固了黑夜中的友方' };
    }
    if (existing) return { ok: false, message: '该格已有地块' };
    if (item.blockType === BlockType.SENSING_WALL && gameState.board.findSector(block => block?.type === BlockType.SENSING_WALL) !== null) {
      return { ok: false, message: '最多只能存在 1 个感应石墙' };
    }

    const block = item.blockType === BlockType.PRESSURE_STONE
      ? createPlacedPressureStone(sector, gameState.aliveDragons, gameState.rotationAngle)
      : createPlacedBlock(item.blockType);
    this.applyRelicBlockCreationModifiers(gameState, block);
    gameState.board.setSector(sector, block);
    this.applyPlacementSmithyBonus(gameState, sector, block);
    RelicSystem.applyPlacedBlockModifiers(gameState, block);
    this.applyAfterPlacementEffects(gameState, sector, block);
    EventBus.emit('blockCreated', { sector, blockType: item.blockType, source: 'shop' });
    EventBus.emit('blockPlaced', { sector, blockType: item.blockType });
    return { ok: true, message: '建筑已放置' };
  }

  private castSelectedSpell(gameState: GameState, selected: ShopSelection, sector: number | null, targetIntent: ShopTargetIntent): PlacementResult {
    const item = selected.item;
    if (item.kind !== 'spell') return { ok: false, message: '未选择法术' };
    if (item.spellType === SpellType.BULWARK) return this.castBulwark(gameState);
    if (item.spellType === SpellType.MAGIC_BOOK) return this.castMagicBook();
    if (sector === null) return { ok: false, message: '请选择法术目标' };
    if (item.spellType === SpellType.MISSILE) return this.castMissile(gameState, sector, targetIntent);
    if (item.spellType === SpellType.APPLE) return this.castApple(gameState, sector);
    if (item.spellType === SpellType.FOCUS_DEFENSE) return this.castFocusDefense(gameState, sector);
    if (item.spellType === SpellType.FOCUS_BREAKTHROUGH) return this.castFocusBreakthrough(gameState, sector);
    if (item.spellType === SpellType.SACRIFICE) return this.castSacrifice(gameState, sector);
    if (item.spellType === SpellType.SHIELD_CRUSH) return this.castShieldCrush(gameState, sector);
    if (item.spellType === SpellType.REPEL) return this.castRepel(gameState, item, sector);
    return { ok: false, message: '未知法术' };
  }

  private castMissile(gameState: GameState, sector: number, targetIntent: ShopTargetIntent): PlacementResult {
    const ctx = this.createShopEffectContext(gameState);
    const selected = this.selectedItem();
    const tempAttack = selected?.item.kind === 'spell' ? selected.item.tempAttack ?? 0 : 0;
    const missileExtraHits = RelicSystem.getMissileExtraHits(gameState);
    const damage = 5 + tempAttack;
    const hits = 1 + missileExtraHits;
    if (targetIntent === 'block') {
      const targetBlock = gameState.board.getSector(sector);
      if (!targetBlock) return { ok: false, message: '该扇区没有地块目标' };

      for (let i = 0; i < hits; i++) {
        if (gameState.board.getSector(sector) !== targetBlock) break;
        damageBlockInContext(targetBlock, sector, damage, ctx, { spell: 'missile' });
      }
      return { ok: true, message: `飞弹造成 ${damage} 伤害 x${hits}` };
    }

    const dragon = findDragonAtBoardSector(gameState.aliveDragons, sector, gameState.rotationAngle);
    if (!dragon) return { ok: false, message: '该扇区没有龙目标' };

    for (let i = 0; i < hits; i++) {
      const currentDragon = findDragonAtBoardSector(gameState.aliveDragons, sector, gameState.rotationAngle);
      const currentBlock = gameState.board.getSector(sector);
      if (currentDragon && (!dragon || currentDragon.id === dragon.id)) damageDragon(currentDragon, damage, ctx, `飞弹对 ${currentDragon.name} 造成 ${damage} 伤害`);
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
    const receiverSector = this.random.pick(candidates);
    const receiver = gameState.board.getSector(receiverSector);
    if (!receiver) return { ok: false, message: '没有可传递的其他友方' };
    const hp = Math.floor(target.hp / 2);
    const attack = Math.floor(target.attack / 2);
    destroyBlockInContext(target, sector, this.createShopEffectContext(gameState), { spell: 'sacrifice' });
    receiver.hp += hp;
    receiver.attack += attack;
    return { ok: true, message: `献祭传递 ${hp} HP / ${attack} 攻击` };
  }

  private castBulwark(gameState: GameState): PlacementResult {
    let affected = 0;
    const ctx = this.createShopEffectContext(gameState);
    gameState.board.forEach((block, sector) => {
      if (!isFriendlyBlock(block) || getBlockAttack(block, ctx, sector) !== 0) return;
      block.hp += 5;
      affected++;
    });
    if (affected === 0) return { ok: false, message: '没有可强化的目标' };
    return { ok: true, message: `壁垒强化 ${affected} 个目标` };
  }

  private castShieldCrush(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target) || target.attack !== 0) return { ok: false, message: '请选择攻击力为 0 的友方' };
    const damage = target.hp;
    const ctx = this.createShopEffectContext(gameState);
    const dragon = findDragonAtBoardSector(gameState.aliveDragons, sector, gameState.rotationAngle);
    const enemyBlock = gameState.board.getSector(sector);
    if (!dragon && !isEnemyBlock(enemyBlock)) return { ok: false, message: '该扇区没有敌人' };
    destroyBlockInContext(target, sector, ctx, { spell: 'shield_crush' });
    if (dragon) damageDragon(dragon, damage, ctx, `盾牌碾压对 ${dragon.name} 造成 ${damage} 伤害`);
    else if (isEnemyBlock(enemyBlock)) damageBlockInContext(enemyBlock, sector, damage, ctx, { spell: 'shield_crush' });
    return { ok: true, message: `盾牌碾压造成 ${damage} 伤害` };
  }

  private consumeSelection(selected: ShopSelection): void {
    if (selected.item.kind === 'spell') selected.item.tempAttack = 0;
    if (selected.debug) {
      this.cancelPlacement();
      return;
    }
    if (selected.area === 'random') {
      this.state.random[selected.index].item = null;
      this.state.random[selected.index].locked = false;
    }
    if (selected.area === 'temporary') {
      this.state.temporary.splice(selected.index, 1);
    }
    this.cancelPlacement();
  }

  private createInitialState(): ShopState {
    return {
      base: BASE_SHOP_ITEMS.map(item => cloneShopItem(item)),
      random: Array.from({ length: RANDOM_SLOT_COUNT }, () => ({ item: null, locked: false })),
      temporary: [],
      refreshCost: INITIAL_REFRESH_COST,
      freeRefreshCredits: 0,
      nextPurchaseDiscount: 0,
    };
  }

  private refillRandomSlots(): void {
    for (let index = 0; index < this.state.random.length; index++) {
      const slot = this.state.random[index];
      if (slot.locked || slot.item) continue;
      const available = this.getAvailableRandomItems();
      slot.item = available.length > 0 ? cloneShopItem(this.random.pick(available)) : null;
    }
  }

  private getAvailableRandomItems(): ShopItem[] {
    const used = new Set(this.state.random.map(slot => slot.item?.id).filter((id): id is string => Boolean(id)));
    used.add('spell:repel');
    return RANDOM_SHOP_POOL.filter(item => !used.has(item.id));
  }

  private getItem(section: ShopSectionKey, index: number): ShopItem | null {
    if (section === 'base') return this.state.base[index] ?? null;
    if (section === 'temporary') return this.state.temporary[index] ?? null;
    return this.state.random[index]?.item ?? null;
  }

  private isValidIndex(section: ShopSectionKey, index: number): boolean {
    if (section === 'base') return index >= 0 && index < this.state.base.length;
    if (section === 'temporary') return index >= 0 && index < this.state.temporary.length;
    return index >= 0 && index < this.state.random.length;
  }

  private applyPlacementSmithyBonus(gameState: GameState, sector: number, block: BlockData): void {
    if (!isFriendlyBlock(block)) return;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const smithy = gameState.board.getSector(adjacent);
      if (smithy?.type !== BlockType.SMITHY) continue;
      block.attack += getBlockAttack(smithy, this.createShopEffectContext(gameState), adjacent);
      smithy.attack += 1;
    }
  }

  effectiveCost(item: ShopItem): number {
    if (item.kind === 'action') return item.cost;
    return Math.max(0, item.cost - this.state.nextPurchaseDiscount);
  }

  addTemporaryItem(item: ShopItem): void {
    this.state.temporary.push(item);
  }

  private addTemporaryCopyIfMissing(itemId: string): boolean {
    if (this.state.temporary.some(item => item.id === itemId)) return false;
    const source = SHOP_ITEM_POOL.find(item => item.id === itemId);
    if (!source) return false;
    const copy = cloneShopItem(source);
    if (copy.kind === 'spell') copy.temporary = true;
    this.state.temporary.push(copy);
    return true;
  }

  addRepelSpell(templateId: string): void {
    const repelData = ITEM_DATA_BY_ID.get('spell:repel');
    const base = cloneShopItem(RANDOM_SHOP_POOL.find(item => item.kind === 'spell' && item.spellType === SpellType.REPEL) ?? {
      id: 'spell:repel',
      kind: 'spell',
      spellType: SpellType.REPEL,
      label: repelData?.label ?? '驱离',
      cost: 0,
      tags: [...(repelData?.tags ?? ['法术'])],
      description: [...(repelData?.description ?? ['驱赶与生成时绑定类型相同的龙，使其离开'])],
    } as SpellShopItem) as SpellShopItem;
    base.cost = 5;
    base.temporary = true;
    base.repelTemplateId = templateId;
    this.addTemporaryItem(base);
  }

  private effectivePlacedBlockHp(gameState: GameState, item: Extract<ShopItem, { kind: 'block' }>): number {
    let hp = item.hp;
    if (item.blockType === BlockType.WOOD_WALL) hp += RelicSystem.getPlacedWoodWallHpDelta(gameState);
    return Math.max(1, hp);
  }

  private applyRelicBlockCreationModifiers(gameState: GameState, block: BlockData): void {
    RelicSystem.applyGeneratedBlockModifiers(gameState, block);
  }

  private applyAfterPlacementEffects(gameState: GameState, sector: number, block: BlockData): void {
    if (block.type === BlockType.PRESSURE_STONE && RelicSystem.has(gameState, RelicId.PRESSURE_GOLD) && block.hp > 0) {
      gameState.applyVillageGoldDelta(block.hp);
      gameState.addMessage(`压力炼金：金币 +${block.hp}`);
    }
    if (block.type === BlockType.GOBLIN) {
      this.state.nextPurchaseDiscount = Math.max(this.state.nextPurchaseDiscount, 10);
      gameState.addMessage('地精：下一次购买 -10 金币');
    }
    if (block.type === BlockType.MARKET) {
      this.state.freeRefreshCredits++;
      gameState.addMessage('市场：本回合免费刷新 +1');
    }
    if (block.type === BlockType.WIZARD) {
      const dragon = findDragonAtBoardSector(gameState.aliveDragons, sector, gameState.rotationAngle);
      if (dragon) {
        this.addRepelSpell(dragon.templateId);
        gameState.addMessage(`巫师生成了针对${dragon.name}的驱离`);
      }
    }
    if (block.type === BlockType.SCOUT) {
      let gainedHp = 0;
      for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
        const target = gameState.board.getSector(adjacent);
        if (target) gainedHp += Math.floor(target.hp / 2);
      }
      if (gainedHp > 0) {
        block.hp += gainedHp;
        gameState.addMessage(`斥候：HP +${gainedHp}`);
      }
      gameState.nextDragonSpawnSector = sector;
      gameState.addMessage('斥候标记了下一条龙的出现扇区');
    }
  }

  private castApple(gameState: GameState, sector: number): PlacementResult {
    const target = gameState.board.getSector(sector);
    if (!isFriendlyBlock(target)) return { ok: false, message: '请选择友方建筑/单位' };
    target.hp += 3;
    target.attack += 3;
    return { ok: true, message: '苹果强化 +3/+3' };
  }

  private castMagicBook(): PlacementResult {
    const spells = RANDOM_SHOP_POOL.filter((item): item is SpellShopItem =>
      item.kind === 'spell'
      && item.spellType !== SpellType.MAGIC_BOOK
      && item.spellType !== SpellType.REPEL,
    );
    const pool = [...spells];
    for (let i = 0; i < 2 && pool.length > 0; i++) {
      const picked = pool.splice(this.random.int(0, pool.length - 1), 1)[0];
      const copy = cloneShopItem(picked) as SpellShopItem;
      copy.temporary = true;
      this.addTemporaryItem(copy);
    }
    return { ok: true, message: '魔法书生成了临时法术' };
  }

  private castRepel(gameState: GameState, item: SpellShopItem, sector: number): PlacementResult {
    const dragon = findDragonAtBoardSector(gameState.aliveDragons, sector, gameState.rotationAngle);
    if (!dragon) return { ok: false, message: '该扇区没有龙' };
    if (item.repelTemplateId && dragon.templateId !== item.repelTemplateId) return { ok: false, message: '驱离无法影响该类型的龙' };
    markDragonDeparted(dragon);
    EventBus.emit('dragonDeparting', { dragonId: dragon.id, name: dragon.name });
    return { ok: true, message: `${dragon.name} 被驱离` };
  }

  private recalculateFreeRefreshCredits(gameState: GameState): void {
    let markets = 0;
    gameState.board.forEach(block => {
      if (block?.type === BlockType.MARKET) markets++;
    });
    this.state.freeRefreshCredits = markets;
  }

  applyStartOfPlayerTurnEffects(gameState: GameState): void {
    this.state.refreshCost = INITIAL_REFRESH_COST;
    this.recalculateFreeRefreshCredits(gameState);
    this.applyMageSpellTraining(gameState);
  }

  private applyMageSpellTraining(gameState: GameState): void {
    let mageCount = 0;
    gameState.board.forEach(block => {
      if (block?.type === BlockType.MAGE) mageCount++;
    });
    if (mageCount <= 0) return;
    const gain = mageCount * 2;
    for (const item of this.allShopItems()) {
      if (item.kind === 'spell' && item.spellType === SpellType.MISSILE) item.tempAttack = (item.tempAttack ?? 0) + gain;
    }
  }

  private allShopItems(): ShopItem[] {
    return [
      ...this.state.base,
      ...this.state.random.map(slot => slot.item).filter((item): item is ShopItem => Boolean(item)),
      ...this.state.temporary,
    ];
  }

  private currentMissileDamage(): number {
    const missile = this.findCurrentMissile();
    const tempAttack = missile?.tempAttack ?? 0;
    return 5 + tempAttack;
  }

  private findCurrentMissile(): SpellShopItem | null {
    const baseMissile = this.state.base.find((item): item is SpellShopItem =>
      item.kind === 'spell' && item.spellType === SpellType.MISSILE,
    );
    if (baseMissile) return baseMissile;
    return this.allShopItems().find((item): item is SpellShopItem =>
      item.kind === 'spell' && item.spellType === SpellType.MISSILE,
    ) ?? null;
  }

  private createShopEffectContext(gameState: GameState): ReturnType<typeof createEffectContext> {
    return createEffectContext(gameState, { random: this.random });
  }
}

function selectionMessage(item: ShopItem): string {
  if (item.kind === 'action' && item.actionType === ShopActionType.SELL) return '选择出售目标';
  if (item.kind === 'spell') return '选择法术目标';
  return '选择放置的扇区';
}
