import { RelicDef, RELIC_DEFS, RELIC_DEF_BY_ID } from '../config/blockTypes';
import type { GameState } from '../core/GameState';
import { markDragonDeparted } from '../models/Dragon';
import { BlockData } from '../models/Block';
import { BlockType } from '../config/blockTypes';
import { EffectContext, RandomPort } from '../effects/EffectContext';
import {
  damageBlockInContext,
  damageDragon,
  findDragonAtBoardSector,
  isFriendlyBlock,
} from '../effects/BlockEffectRegistry';
import type { DragonState } from '../models/Dragon';
import type { SellContext } from './SellEffectRegistry';

export const RelicId = {
  VILLAGE_HEART: 'village_heart',
  AUTO_MISSILE: 'auto_missile',
  NIGHT_SHIELD: 'night_shield',
  WOOD_WALL_HP: 'wood_wall_hp',
  WOOD_WALL_DEATH: 'wood_wall_death',
  WOOD_WALL_NIGHT_STACK: 'wood_wall_night_stack',
  GOLD_MINE_RALLY: 'gold_mine_rally',
  GOLD_ATTACK: 'gold_attack',
  SINGLE_DRAGON_KNIGHT: 'single_dragon_knight',
  PRESSURE_GOLD: 'pressure_gold',
  FRIENDLY_GROWTH: 'friendly_growth',
  MISSILE_EXTRA_HIT: 'missile_extra_hit',
  MINE_ATTACK: 'mine_attack',
  GOLD_CURSE: 'gold_curse',
  DRAGON_BOUNTY: 'dragon_bounty',
  INFANTRY_LEGACY: 'infantry_legacy',
  SELL_COPY: 'sell_copy',
  MILITIA_DEATHRATTLE: 'militia_deathrattle',
  WOUNDED_VETERANS: 'wounded_veterans',
} as const;

export type RelicIdValue = typeof RelicId[keyof typeof RelicId];

export interface OwnedRelic {
  id: string;
  count: number;
}

export interface RelicState {
  owned: OwnedRelic[];
  pendingChoices: RelicDef[];
  selectedChoiceId: string | null;
  goldCurseActiveThisTurn: boolean;
  infantryLegacyBonus: number;
  rewardedDragonIds: string[];
}

export function createInitialRelicState(): RelicState {
  return {
    owned: [],
    pendingChoices: [],
    selectedChoiceId: null,
    goldCurseActiveThisTurn: false,
    infantryLegacyBonus: 1,
    rewardedDragonIds: [],
  };
}

export class RelicSystem {
  static getCount(state: GameState, id: string): number {
    return state.relics.owned.find(relic => relic.id === id)?.count ?? 0;
  }

  static has(state: GameState, id: string): boolean {
    return this.getCount(state, id) > 0;
  }

  static createChoices(state: GameState, count: number = 4, random: Pick<RandomPort, 'pick'> = defaultRandom): RelicDef[] {
    const candidates = RELIC_DEFS.filter(relic => {
      const owned = this.getCount(state, relic.id);
      return relic.maxSelections === null || owned < relic.maxSelections;
    });
    const pool = [...candidates];
    const choices: RelicDef[] = [];
    while (choices.length < count && pool.length > 0) {
      const picked = random.pick(pool);
      choices.push(picked);
      pool.splice(pool.indexOf(picked), 1);
    }
    state.relics.pendingChoices = choices;
    state.relics.selectedChoiceId = null;
    return choices;
  }

  static selectPendingChoice(state: GameState, id: string): boolean {
    if (!state.relics.pendingChoices.some(relic => relic.id === id)) return false;
    state.relics.selectedChoiceId = id;
    return true;
  }

  static confirmSelection(state: GameState): RelicDef | null {
    const id = state.relics.selectedChoiceId;
    const def = id ? RELIC_DEF_BY_ID.get(id) ?? null : null;
    if (!id || !def) return null;
    this.grant(state, id);
    state.relics.pendingChoices = [];
    state.relics.selectedChoiceId = null;
    return def;
  }

  static grant(state: GameState, id: string): void {
    const owned = state.relics.owned.find(relic => relic.id === id);
    if (owned) owned.count++;
    else state.relics.owned.push({ id, count: 1 });
    this.applyOnGrant(state, id, this.getCount(state, id));
  }

  static applyOnPlayerTurnStart(state: GameState, random: RandomPort = defaultRandom): void {
    state.relics.goldCurseActiveThisTurn = false;

    if (this.has(state, RelicId.NIGHT_SHIELD)) {
      state.board.forEach((block, sector) => {
        if (!isFriendlyBlock(block) || !state.isNight(sector)) return;
        block.shielded = true;
      });
    }

    if (this.has(state, RelicId.GOLD_CURSE)) {
      state.relics.goldCurseActiveThisTurn = true;
      state.applyVillageGoldDelta(40, random);
      state.addMessage('贪婪契约：金币 +40');
    }
  }

  static applyBeforePlayerTurnEnds(state: GameState): void {
    if (!state.relics.goldCurseActiveThisTurn) return;
    state.relics.goldCurseActiveThisTurn = false;
    if (state.board.villageGold <= 0) return;
    state.applyVillageHpDelta(-20);
    state.addMessage('贪婪契约：村庄生命 -20');
  }

  static applyCombatTurnStart(ctx: EffectContext): void {
    this.applyAutoMissile(ctx);
    this.applyPowerStoneRally(ctx);
    this.applyFriendlyGrowth(ctx);
  }

  static getWoodWallHpDelta(state: GameState): number {
    return this.getCount(state, RelicId.WOOD_WALL_HP) * 10;
  }

  static getPlacedWoodWallHpDelta(state: GameState): number {
    return this.getWoodWallHpDelta(state) - (this.has(state, RelicId.WOOD_WALL_DEATH) ? 5 : 0);
  }

  static applyGeneratedBlockModifiers(state: GameState, block: BlockData): void {
    if (block.type === BlockType.WOOD_WALL) block.hp = Math.max(1, block.hp + this.getPlacedWoodWallHpDelta(state));
  }

  static applyPlacedBlockModifiers(state: GameState, block: BlockData): void {
    if (block.type !== BlockType.INFANTRY || !this.has(state, RelicId.INFANTRY_LEGACY)) return;
    const bonus = Math.max(1, state.relics.infantryLegacyBonus);
    block.hp += bonus;
    block.attack += bonus;
  }

  static getMissileExtraHits(state: GameState): number {
    return this.getCount(state, RelicId.MISSILE_EXTRA_HIT);
  }

  static getKnightRotationMultiplier(state: GameState): number {
    return this.has(state, RelicId.SINGLE_DRAGON_KNIGHT) && state.aliveDragons.length === 1 ? 2 : 1;
  }

  static getMineAttackBonus(state: GameState): number {
    return this.has(state, RelicId.MINE_ATTACK) ? 3 : 0;
  }

  static onBlockDestroyed(block: BlockData, sector: number, ctx: EffectContext): void {
    if (block.type === BlockType.WOOD_WALL && this.has(ctx.state, RelicId.WOOD_WALL_DEATH)) {
      const dragon = findDragonAtBoardSector(ctx.state.aliveDragons, sector, ctx.state.rotationAngle);
      if (dragon) damageDragon(dragon, 20, ctx, `爆裂木墙对 ${dragon.name} 造成 20 伤害`, 'relic:wood_wall_death');
    }

    if (block.type === BlockType.GHOST && ctx.isNight(sector) && ctx.board.isEmpty(sector)) {
      const ghost = ctx.blockFactory.createBlock(BlockType.GHOST, 1, block.attack);
      ctx.board.setSector(sector, ghost);
      ctx.events.emit('blockCreated', { sector, blockType: BlockType.GHOST, source: 'ghost_deathrattle' });
      ctx.addMessage('幽灵在黑夜中重返战场');
    }

    if (block.type === BlockType.INFANTRY && this.has(ctx.state, RelicId.INFANTRY_LEGACY)) {
      ctx.state.relics.infantryLegacyBonus++;
      ctx.addMessage(`步兵传承：未来步兵 +${ctx.state.relics.infantryLegacyBonus}/+${ctx.state.relics.infantryLegacyBonus}`);
    }

    if (this.has(ctx.state, RelicId.MILITIA_DEATHRATTLE) && shouldSummonMilitia(block, ctx.state) && ctx.board.isEmpty(sector)) {
      const infantry = ctx.blockFactory.createBlock(BlockType.INFANTRY, 5, 5);
      ctx.board.setSector(sector, infantry);
      ctx.events.emit('blockCreated', { sector, blockType: BlockType.INFANTRY, source: 'militia_deathrattle' });
      ctx.addMessage('民兵遗愿：召唤 5/5 步兵');
    }
  }

  static onBlockDamaged(block: BlockData, _sector: number, lostHp: number, ctx: EffectContext): void {
    if (lostHp <= 0 || block.hp <= 0 || !this.has(ctx.state, RelicId.WOUNDED_VETERANS)) return;
    if (!VETERAN_TYPES.has(block.type)) return;
    block.attack += 2;
    ctx.addMessage('浴血精锐：攻击 +2');
  }

  static onDragonDefeated(dragon: DragonState, ctx: EffectContext): void {
    if (!this.has(ctx.state, RelicId.DRAGON_BOUNTY)) return;
    if (ctx.state.relics.rewardedDragonIds.includes(dragon.id)) return;
    ctx.state.relics.rewardedDragonIds.push(dragon.id);
    ctx.applyVillageGoldDelta(15);
    ctx.applyVillageHpDelta(10);
    ctx.addMessage('屠龙赏金：金币 +15，村庄 HP +10');
  }

  static onAfterSell(ctx: SellContext, addTemporaryItem: (itemId: string) => boolean): void {
    if (!this.has(ctx.state, RelicId.SELL_COPY)) return;
    const itemId = `block:${ctx.block.type}`;
    if (addTemporaryItem(itemId)) ctx.messages.push('战术回收：临时商店获得出售单位的复制');
  }

  static onGoldGained(state: GameState, amount: number, random: Pick<RandomPort, 'pick'> = defaultRandom): void {
    if (amount <= 0 || !this.has(state, RelicId.GOLD_ATTACK)) return;
    const friendlies = friendlyEntries(state);
    if (friendlies.length === 0) return;
    random.pick(friendlies).block.attack += 3;
  }

  private static applyOnGrant(state: GameState, id: string, count: number): void {
    if (id === RelicId.VILLAGE_HEART) {
      const amount = 50 * count;
      state.applyVillageHpDelta(amount);
      state.addMessage(`村庄之心：生命 +${amount}`);
      return;
    }

    if (id === RelicId.WOOD_WALL_HP) {
      state.board.forEach(block => {
        if (block?.type === BlockType.WOOD_WALL) block.hp += 10;
      });
      return;
    }

  }

  private static applyAutoMissile(ctx: EffectContext): void {
    const count = this.getCount(ctx.state, RelicId.AUTO_MISSILE);
    if (count <= 0) return;
    for (let shot = 0; shot < count; shot++) {
      const target = [...ctx.state.aliveDragons].sort((a, b) => b.hp - a.hp || a.edgeIndex - b.edgeIndex)[0];
      if (!target) return;
      const damage = ctx.combatStats.missileDamage;
      const hits = 1 + this.getMissileExtraHits(ctx.state);
      for (let i = 0; i < hits && target.isAlive; i++) {
        damageDragon(target, damage, ctx, `遗物飞弹对 ${target.name} 造成 ${damage} 伤害`, 'relic:auto_missile');
      }
    }
  }

  private static applyPowerStoneRally(ctx: EffectContext): void {
    if (!this.has(ctx.state, RelicId.GOLD_MINE_RALLY)) return;
    const mines = ctx.state.board.findAllSectors(block => block?.type === BlockType.POWER_STONE);
    for (const _sector of mines) {
      const friendlies = friendlyEntries(ctx.state);
      if (friendlies.length === 0) return;
      const target = ctx.random.pick(friendlies).block;
      target.hp += 1;
      target.attack += 1;
    }
  }

  private static applyFriendlyGrowth(ctx: EffectContext): void {
    if (!this.has(ctx.state, RelicId.FRIENDLY_GROWTH)) return;
    for (const { block } of friendlyEntries(ctx.state)) {
      if (ctx.random.int(0, 1) === 0) block.hp += 2;
      else block.attack += 1;
    }
  }
}

const VETERAN_TYPES = new Set<BlockType>([BlockType.KNIGHT, BlockType.INFANTRY, BlockType.SCOUT]);

function shouldSummonMilitia(block: BlockData, state: GameState): boolean {
  if (!isFriendlyBlock(block)) return false;
  if (block.type === BlockType.GHOST) return false;
  if (block.type === BlockType.WOOD_WALL && RelicSystem.has(state, RelicId.WOOD_WALL_DEATH)) return false;
  return true;
}

function friendlyEntries(state: GameState): { sector: number; block: BlockData }[] {
  const entries: { sector: number; block: BlockData }[] = [];
  state.board.forEach((block, sector) => {
    if (isFriendlyBlock(block)) entries.push({ sector, block });
  });
  return entries;
}

const defaultRandom: RandomPort = {
  int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  },
};
