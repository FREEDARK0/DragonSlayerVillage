import { BLOCK_TYPE_TABLE, BlockType, getBlockTypeDescriptions } from '../config/blockTypes';
import { EventBus } from '../core/EventBus';
import { BlockData, createBlock, createDragonFire, createPowerStone, createVoodooDoll } from '../models/Block';
import { DragonState, dragonTakeDamage, markDragonDefeated } from '../models/Dragon';
import { EffectContext, IncomeEffectContext } from './EffectContext';

export interface DragonBreathHit {
  dragon: DragonState;
  sector: number;
  block: BlockData;
  damage: number;
  allDragons: DragonState[];
}

export type BlockAttackSource = 'player_phase' | 'portal' | 'infantry_assist' | 'spikes' | 'spell';

export interface BlockDragonAttack {
  block: BlockData;
  sector: number;
  target: DragonState;
  ctx: EffectContext;
  source: BlockAttackSource;
}

export interface BlockDragonAttackResult {
  attacked: boolean;
  damage: number;
}

export interface BlockEffectDefinition {
  type: BlockType;
  describe?(): string[];
  income?(block: BlockData, sector: number, ctx: IncomeEffectContext): number;
  onTurnStart?(block: BlockData, sector: number, ctx: EffectContext): void;
  onTurnEnd?(block: BlockData, sector: number, ctx: EffectContext): void;
  onBreathHit?(hit: DragonBreathHit, ctx: EffectContext): void;
  onDestroyed?(block: BlockData, sector: number, ctx: EffectContext, source?: DamageSource): void;
}

export interface DamageSource {
  dragon?: DragonState;
  block?: BlockData;
  spell?: string;
}

const definitions = new Map<BlockType, BlockEffectDefinition>();
const BASE_VILLAGE_GOLD_INCOME = 5;

export function registerBlockEffect(definition: BlockEffectDefinition): void {
  definitions.set(definition.type, definition);
}

export function getBlockEffect(type: BlockType): BlockEffectDefinition | undefined {
  return definitions.get(type);
}

export function getAllBlockEffects(): BlockEffectDefinition[] {
  return [...definitions.values()];
}

export function calculateVillageIncome(ctx: IncomeEffectContext): number {
  let income = BASE_VILLAGE_GOLD_INCOME;
  ctx.board.forEach((block, sector) => {
    if (!block) return;
    income += getBlockEffect(block.type)?.income?.(block, sector, ctx) ?? 0;
  });
  return income;
}

export function runBlockTurnStart(ctx: EffectContext): void {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    getBlockEffect(block.type)?.onTurnStart?.(block, sector, ctx);
  }
}

export function runFriendlyAttacks(ctx: EffectContext): void {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    if (ctx.board.getSector(sector) !== block || !isFriendlyBlock(block)) continue;
    const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === sector);
    if (!dragon) {
      if (block.type === BlockType.BALLISTA) block.tempAttack += 5;
      continue;
    }
    attackDragonWithBlock(block, sector, dragon, ctx, 'player_phase');
  }
}

export function runBlockTurnEnd(ctx: EffectContext): void {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    getBlockEffect(block.type)?.onTurnEnd?.(block, sector, ctx);
    resetTurnTemporaryStats(block);
  }
}

export function getBlockEffectDescriptions(type: BlockType): string[] {
  return getBlockTypeDescriptions(type);
}

export function getBlockAttack(block: BlockData, ctx?: EffectContext, sector?: number): number {
  let attack = block.type === BlockType.GUARDIAN ? block.hp : block.attack;
  attack += block.tempAttack + block.turnAttackBonus;
  if (block.type === BlockType.ASSASSIN && ctx && sector !== undefined && ctx.isNight(sector)) attack += 35;
  return Math.max(0, attack);
}

export function canBlockAttackDragon(block: BlockData, ctx?: EffectContext, sector?: number): boolean {
  return isFriendlyBlock(block) && getBlockAttack(block, ctx, sector) > 0;
}

export function attackDragonWithBlock(block: BlockData, sector: number, target: DragonState, ctx: EffectContext, source: BlockAttackSource): BlockDragonAttackResult {
  if (!target.isAlive || ctx.board.getSector(sector) !== block) return { attacked: false, damage: 0 };
  let damage = getBlockAttack(block, ctx, sector);
  if (block.type === BlockType.DRAGON_SPEAR) damage += ctx.board.getEmptySectors().length * 10;
  if (damage <= 0) return { attacked: false, damage: 0 };

  damageDragon(target, damage, ctx, attackMessage(source, BLOCK_TYPE_TABLE[block.type].label, target, damage));

  if (block.type === BlockType.BALLISTA) block.tempAttack = 0;
  if (block.type === BlockType.ASSASSIN && ctx.board.getSector(sector) === block) {
    destroyBlockInContext(block, sector, ctx, { block });
  }
  if (block.type === BlockType.DRAGON_SPEAR && !target.isAlive) {
    ctx.state.skipRemainingDragonActions = true;
  }
  if (source !== 'infantry_assist') {
    triggerInfantryAssists(sector, target, ctx);
  }
  return { attacked: true, damage };
}

export function damageDragon(dragon: DragonState, damage: number, ctx: EffectContext, message?: string): void {
  if (damage <= 0 || !dragon.isAlive) return;
  dragonTakeDamage(dragon, damage);
  if (message) ctx.addMessage(message);
  ctx.events.emit('dragonDamaged', { dragonId: dragon.id, damage });
  if (dragon.hp <= 0) {
    markDragonDefeated(dragon, ctx.state.turnNumber + 6);
    ctx.events.emit('dragonDied', { dragonId: dragon.id });
  }
}

export function damageBlockInContext(block: BlockData, sector: number, damage: number, ctx: EffectContext, source?: DamageSource): { destroyed: boolean; lostHp: number } {
  if (damage <= 0 || ctx.board.getSector(sector) !== block) return { destroyed: false, lostHp: 0 };
  const before = block.hp;
  block.hp = Math.max(0, block.hp - damage);
  const lostHp = before - block.hp;
  if (block.tempHp > 0 && lostHp > 0) block.tempHp = Math.max(0, block.tempHp - lostHp);

  if (block.type === BlockType.POWER_STONE && lostHp > 0) {
    ctx.state.applyVillageGoldDelta(lostHp);
    ctx.addMessage(`金矿受击，金币 +${lostHp}`);
  }

  if (lostHp > 0) {
    EventBus.emit('blockDamaged', { sector, blockType: block.type, damage: lostHp, hp: block.hp });
  }

  if (block.type === BlockType.VOODOO && block.targetDragonId && lostHp > 0) {
    const target = ctx.state.dragons.find(d => d.id === block.targetDragonId && d.isAlive);
    if (target) damageDragon(target, lostHp, ctx, `巫毒娃娃传递 ${lostHp} 伤害给 ${target.name}`);
  }

  if (block.hp > 0) return { destroyed: false, lostHp };
  destroyBlockInContext(block, sector, ctx, source);
  return { destroyed: true, lostHp };
}

export function destroyBlockInContext(block: BlockData, sector: number, ctx: EffectContext, source?: DamageSource): void {
  if (ctx.board.getSector(sector) !== block) return;
  ctx.board.removeBlock(sector);
  ctx.events.emit('blockDestroyed', { sector, blockType: block.type, hp: block.hp });
  getBlockEffect(block.type)?.onDestroyed?.(block, sector, ctx, source);
}

export function applyBreathHit(hit: DragonBreathHit, ctx: EffectContext): void {
  getBlockEffect(hit.block.type)?.onBreathHit?.(hit, ctx);
}

export function isFriendlyBlock(block: BlockData | null): block is BlockData {
  if (!block) return false;
  return BLOCK_TYPE_TABLE[block.type].purchasable;
}

export function isEnemyBlock(block: BlockData | null): block is BlockData {
  return block?.type === BlockType.VOODOO || block?.type === BlockType.DRAGON_FIRE;
}

export function createPlacedBlock(type: BlockType): BlockData {
  const def = BLOCK_TYPE_TABLE[type];
  return createBlock(type, def.hp, def.attack);
}

export function createPlacedPressureStone(sector: number, dragons: DragonState[]): BlockData {
  let totalHp = 0;
  for (const edgeIndex of [sector, (sector - 1 + 8) % 8, (sector + 1) % 8]) {
    const dragon = dragons.find(d => d.isAlive && d.edgeIndex === edgeIndex);
    if (dragon) totalHp += dragon.hp;
  }
  return createBlock(BlockType.PRESSURE_STONE, Math.floor(totalHp / 4), 0);
}

export function moveDragonInContext(dragon: DragonState, targetEdge: number, ctx: EffectContext): void {
  if (!dragon.isAlive || dragon.edgeIndex === targetEdge) return;
  const used = ctx.state.aliveDragons.some(other => other !== dragon && other.edgeIndex === targetEdge);
  if (used) return;
  const from = dragon.edgeIndex;
  triggerSpikesAt(from, dragon, ctx);
  dragon.edgeIndex = ((targetEdge % 8) + 8) % 8;
  triggerSpikesAt(dragon.edgeIndex, dragon, ctx);
}

export function moveDragonStepwise(dragon: DragonState, direction: 1 | -1, steps: number, ctx: EffectContext): void {
  for (let i = 0; i < steps && dragon.isAlive; i++) {
    const next = ((dragon.edgeIndex + direction) % 8 + 8) % 8;
    if (ctx.state.aliveDragons.some(other => other !== dragon && other.edgeIndex === next)) return;
    moveDragonInContext(dragon, next, ctx);
  }
}

export function createGoldMine(): BlockData {
  return createPowerStone();
}

export { createDragonFire };

function triggerInfantryAssists(attackerSector: number, target: DragonState, ctx: EffectContext): void {
  for (const sector of [(attackerSector + 7) % 8, (attackerSector + 1) % 8]) {
    const block = ctx.board.getSector(sector);
    if (!block || block.type !== BlockType.INFANTRY || !target.isAlive) continue;
    const damage = getBlockAttack(block, ctx, sector);
    if (damage <= 0) continue;
    damageDragon(target, damage, ctx, `步兵协同对 ${target.name} 造成 ${damage} 伤害`);
  }
}

function triggerSpikesAt(sector: number, dragon: DragonState, ctx: EffectContext): void {
  const block = ctx.board.getSector(sector);
  if (!block || block.type !== BlockType.SPIKES || !dragon.isAlive) return;
  const damage = getBlockAttack(block, ctx, sector);
  if (damage <= 0) return;
  damageDragon(dragon, damage, ctx, `地刺对 ${dragon.name} 造成 ${damage} 伤害`);
}

function snapshotBlocks(ctx: EffectContext): { block: BlockData; sector: number }[] {
  const entries: { block: BlockData; sector: number }[] = [];
  ctx.board.forEach((block, sector) => {
    if (block) entries.push({ block, sector });
  });
  return entries;
}

function resetTurnTemporaryStats(block: BlockData): void {
  if (block.tempHp > 0) {
    const remainingTempHp = Math.min(block.tempHp, block.hp);
    block.hp -= remainingTempHp;
    block.tempHp = 0;
  }
  block.turnAttackBonus = 0;
}

function attackMessage(source: BlockAttackSource, actor: string, target: DragonState, damage: number): string {
  if (source === 'portal') return `通道触发，${actor}对 ${target.name} 造成 ${damage} 伤害`;
  if (source === 'spikes') return `地刺对 ${target.name} 造成 ${damage} 伤害`;
  return `${actor}对 ${target.name} 造成 ${damage} 伤害`;
}

registerBlockEffect({
  type: BlockType.MINE,
  describe: () => ['每回合获得 4 金币'],
  income() {
    return 4;
  },
});

registerBlockEffect({
  type: BlockType.TAVERN,
  describe: () => ['白天每回合 +2 金币', '黑夜每回合 +6 金币'],
  income(_block, sector, ctx) {
    return ctx.isNight(sector) ? 6 : 2;
  },
});

registerBlockEffect({
  type: BlockType.KNIGHT,
  describe: () => ['每次攻击前，本回合每旋转 1 扇区获得 +2/+2（临时）'],
  onTurnStart(block, _sector, ctx) {
    const gain = Math.abs(ctx.state.turnRotationSteps) * 2;
    if (gain <= 0) return;
    block.hp += gain;
    block.tempHp += gain;
    block.turnAttackBonus += gain;
  },
});

registerBlockEffect({
  type: BlockType.MAGE,
  describe: () => ['所有法术伤害附加自身攻击力', '飞弹增加 1 次效果，可叠加', '每回合 +1 攻击力'],
  onTurnStart(block) {
    block.attack += 1;
  },
});

registerBlockEffect({
  type: BlockType.BALLISTA,
  describe: () => ['每回合若未攻击，+5 临时攻击力', '攻击后移除已积累的临时攻击力'],
});

registerBlockEffect({
  type: BlockType.PRESSURE_STONE,
  describe: () => ['放置时获得本扇区及左右相邻扇区所有龙当前 HP 总和的 1/4（向下取整）'],
});

registerBlockEffect({
  type: BlockType.GUARDIAN,
  describe: () => ['攻击力始终与 HP 相同'],
});

registerBlockEffect({
  type: BlockType.PORTAL,
  describe: () => ['被吐息命中时，对侧扇区可攻击友方会反击该龙', '自身受到伤害正常计算'],
  onBreathHit(hit, ctx) {
    const opposite = (hit.sector + 4) % 8;
    const ally = ctx.board.getSector(opposite);
    if (!ally || !canBlockAttackDragon(ally, ctx, opposite)) return;
    attackDragonWithBlock(ally, opposite, hit.dragon, ctx, 'portal');
  },
});

registerBlockEffect({
  type: BlockType.BELLOWS,
  describe: () => ['受击后，将攻击者沿顺时针方向逐格移动 3 格'],
  onBreathHit(hit, ctx) {
    moveDragonStepwise(hit.dragon, 1, 3, ctx);
  },
});

registerBlockEffect({
  type: BlockType.WIZARD,
  describe: () => ['死亡时在随机空位召唤记录击杀者的巫毒娃娃', '巫毒娃娃受到的伤害也会作用于记录目标'],
  onDestroyed(_block, _sector, ctx, source) {
    const attacker = source?.dragon;
    if (!attacker) return;
    const empty = ctx.board.getEmptySectors();
    if (empty.length === 0) return;
    const sector = ctx.random.pick(empty);
    ctx.board.setSector(sector, createVoodooDoll({ id: attacker.id, color: attacker.color }));
    ctx.addMessage(`巫师召唤了${attacker.name}的巫毒娃娃`);
  },
});

registerBlockEffect({
  type: BlockType.VOODOO,
  describe: () => ['每回合顺时针移动 1 格', '会被友方效果判定为敌人', '受到伤害会传递给记录目标'],
  onTurnStart(block, sector, ctx) {
    const target = (sector + 1) % 8;
    if (!ctx.board.isEmpty(target)) return;
    ctx.board.removeBlock(sector);
    ctx.board.setSector(target, block);
  },
});

registerBlockEffect({
  type: BlockType.POWER_STONE,
  describe: () => ['生成时随机获得 1-20 HP', '受击时获得损失 HP 等量金币'],
});

registerBlockEffect({
  type: BlockType.DRAGON_FIRE,
  describe: () => ['每回合对村庄造成等同 HP 的伤害', '建筑/单位放到龙焰上会改为削减龙焰 HP'],
  onTurnStart(block, _sector, ctx) {
    ctx.state.applyVillageHpDelta(-block.hp);
    ctx.addMessage(`龙焰对村庄造成 ${block.hp} 伤害`);
  },
});

registerBlockEffect({ type: BlockType.WOOD_WALL, describe: () => ['8 HP，0 攻击力'] });
registerBlockEffect({ type: BlockType.SPIKES, describe: () => ['有任意单位进入/离开此扇区时，地刺会攻击它'] });
registerBlockEffect({ type: BlockType.SMITHY, describe: () => ['相邻扇区放置建筑/单位时，使其获得铁匠铺当前攻击力，并使铁匠铺 +1 攻击力'] });
registerBlockEffect({ type: BlockType.ASSASSIN, describe: () => ['黑夜时 +35 攻击力', '攻击 1 次后销毁自身'] });
registerBlockEffect({ type: BlockType.SENSING_WALL, describe: () => ['任意空地即将被攻击时，自动移动到该空地抵挡', '最多只能同时存在 1 个'] });
registerBlockEffect({ type: BlockType.DRAGON_SPEAR, describe: () => ['每次攻击前，每有 1 个空地获得 10 临时攻击力', '若攻击击杀任意龙，本轮剩余龙行动全部跳过'] });
registerBlockEffect({ type: BlockType.INFANTRY, describe: () => ['两边相邻扇区的友方攻击时，自身也对其目标攻击 1 次'] });
registerBlockEffect({ type: BlockType.WEAKNESS, describe: () => ['暂无效果'] });
