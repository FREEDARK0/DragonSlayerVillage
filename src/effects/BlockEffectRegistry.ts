import { BLOCK_TYPE_TABLE, BlockType, getBlockTypeDescriptions } from '../config/blockTypes';
import { BlockData, createBlock, createDragonFire, createPowerStone } from '../models/Block';
import { DragonState, dragonTakeDamage, markDragonDefeated } from '../models/Dragon';
import { EffectContext, IncomeEffectContext } from './EffectContext';
import { dragonEdgeToBoardSector, normalizeSector } from '../utils/SectorUtils';
import { RelicSystem } from '../systems/RelicSystem';
import { waitForCombatPacing } from '../systems/CombatPacing';
import { CombatSimulationPolicy } from '../systems/CombatSimulationTypes';

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
  beforeAttack?(block: BlockData, sector: number, ctx: EffectContext): void;
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

export async function runBlockTurnStartSequenced(ctx: EffectContext, policy: CombatSimulationPolicy = ctx.simulationPolicy ?? {}): Promise<void> {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    const effect = getBlockEffect(block.type);
    const hadEffect = Boolean(effect?.onTurnStart);
    effect?.onTurnStart?.(block, sector, ctx);
    if (hadEffect) await waitForCombatPacing(policy, 'blockTurnStart');
  }
}

export function runFriendlyAttacks(ctx: EffectContext): void {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    if (ctx.board.getSector(sector) !== block || !isFriendlyBlock(block)) continue;
    const dragon = findDragonAtBoardSector(ctx.state.aliveDragons, sector, ctx.state.rotationAngle);
    if (!dragon) {
      if (block.type === BlockType.BALLISTA) block.tempAttack += 5;
      continue;
    }
    attackDragonWithBlock(block, sector, dragon, ctx, 'player_phase');
  }
}

export async function runFriendlyAttacksSequenced(ctx: EffectContext, policy: CombatSimulationPolicy = ctx.simulationPolicy ?? {}): Promise<void> {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    if (ctx.board.getSector(sector) !== block || !isFriendlyBlock(block)) continue;
    const dragon = findDragonAtBoardSector(ctx.state.aliveDragons, sector, ctx.state.rotationAngle);
    let changed = false;
    if (!dragon) {
      if (block.type === BlockType.BALLISTA) {
        block.tempAttack += 5;
        changed = true;
      }
    } else {
      changed = attackDragonWithBlock(block, sector, dragon, ctx, 'player_phase').attacked;
    }
    if (changed) await waitForCombatPacing(policy, 'friendlyAttack');
  }
}

export function runBlockTurnEnd(ctx: EffectContext): void {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    getBlockEffect(block.type)?.onTurnEnd?.(block, sector, ctx);
    resetTurnTemporaryStats(block);
  }
}

export async function runBlockTurnEndSequenced(ctx: EffectContext, policy: CombatSimulationPolicy = ctx.simulationPolicy ?? {}): Promise<void> {
  const entries = snapshotBlocks(ctx);
  for (const { block, sector } of entries) {
    const effect = getBlockEffect(block.type);
    const hadEffect = Boolean(effect?.onTurnEnd);
    effect?.onTurnEnd?.(block, sector, ctx);
    resetTurnTemporaryStats(block);
    if (hadEffect) await waitForCombatPacing(policy, 'blockTurnEnd');
  }
}

export function getBlockEffectDescriptions(type: BlockType): string[] {
  return getBlockTypeDescriptions(type);
}

export function getBlockAttack(block: BlockData, ctx?: EffectContext, sector?: number): number {
  let attack = block.type === BlockType.GUARDIAN ? block.hp : block.attack;
  attack += block.tempAttack + block.turnAttackBonus;
  if (block.type === BlockType.ASSASSIN && ctx && sector !== undefined && ctx.isNight(sector)) attack += 35;
  if (block.type === BlockType.MINE && ctx) attack += RelicSystem.getMineAttackBonus(ctx.state);
  return Math.max(0, attack);
}

export function canBlockAttackDragon(block: BlockData, ctx?: EffectContext, sector?: number): boolean {
  return isFriendlyBlock(block) && getBlockAttack(block, ctx, sector) > 0;
}

export function attackDragonWithBlock(block: BlockData, sector: number, target: DragonState, ctx: EffectContext, source: BlockAttackSource): BlockDragonAttackResult {
  if (!target.isAlive || ctx.board.getSector(sector) !== block) return { attacked: false, damage: 0 };
  const policy = ctx.simulationPolicy;
  if (policy?.canFriendlyOffense && !policy.canFriendlyOffense({ block, sector, target, source }, ctx)) {
    policy.trace?.({ phase: 'friendlyOffense', source, sector, dragonId: target.id, skipped: true, message: 'friendly offense skipped by policy' });
    return { attacked: false, damage: 0 };
  }
  getBlockEffect(block.type)?.beforeAttack?.(block, sector, ctx);
  let damage = getBlockAttack(block, ctx, sector);
  if (damage <= 0) return { attacked: false, damage: 0 };

  damageDragon(target, damage, ctx, attackMessage(source, BLOCK_TYPE_TABLE[block.type].label, target, damage), source);

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

export function damageDragon(dragon: DragonState, damage: number, ctx: EffectContext, message?: string, traceSource: string = 'damageDragon'): void {
  if (damage <= 0 || !dragon.isAlive) return;
  dragonTakeDamage(dragon, damage);
  if (message) ctx.addMessage(message);
  ctx.events.emit('dragonDamaged', { dragonId: dragon.id, damage });
  ctx.simulationPolicy?.trace?.({ phase: 'friendlyOffense', source: traceSource, dragonId: dragon.id, value: -damage, message: message ?? `dragon damaged ${damage}` });
  if (dragon.hp <= 0) {
    markDragonDefeated(dragon, ctx.state.turnNumber + 6);
    RelicSystem.onDragonDefeated(dragon, ctx);
    ctx.events.emit('dragonDied', { dragonId: dragon.id });
  }
}

export function damageBlockInContext(block: BlockData, sector: number, damage: number, ctx: EffectContext, source?: DamageSource): { destroyed: boolean; lostHp: number; overflowDamage: number } {
  if (damage <= 0 || ctx.board.getSector(sector) !== block) return { destroyed: false, lostHp: 0, overflowDamage: 0 };
  if (block.shielded) {
    block.shielded = false;
    ctx.events.emit('blockShielded', { sector, blockType: block.type, damage });
    ctx.simulationPolicy?.trace?.({ phase: 'dragonOffense', source: 'shield', sector, value: 0, skipped: true, message: `shield absorbed ${damage}` });
    return { destroyed: false, lostHp: 0, overflowDamage: 0 };
  }
  const before = block.hp;
  block.hp = Math.max(0, block.hp - damage);
  const lostHp = before - block.hp;
  const overflowDamage = Math.max(0, damage - before);
  if (block.tempHp > 0 && lostHp > 0) block.tempHp = Math.max(0, block.tempHp - lostHp);

  if (block.type === BlockType.POWER_STONE && lostHp > 0) {
    ctx.applyVillageGoldDelta(lostHp);
    ctx.addMessage(`金矿受击，金币 +${lostHp}`);
  }

  if (lostHp > 0) {
    ctx.events.emit('blockDamaged', { sector, blockType: block.type, damage: lostHp, hp: block.hp });
    RelicSystem.onBlockDamaged(block, sector, lostHp, ctx);
  }

  if (block.type === BlockType.VOODOO && block.targetDragonId && lostHp > 0) {
    const target = ctx.state.dragons.find(d => d.id === block.targetDragonId && d.isAlive);
    if (target) damageDragon(target, lostHp, ctx, `巫毒娃娃传递 ${lostHp} 伤害给 ${target.name}`);
  }

  if (block.hp > 0) return { destroyed: false, lostHp, overflowDamage };
  destroyBlockInContext(block, sector, ctx, source);
  return { destroyed: true, lostHp, overflowDamage };
}

export function destroyBlockInContext(block: BlockData, sector: number, ctx: EffectContext, source?: DamageSource): void {
  if (ctx.board.getSector(sector) !== block) return;
  ctx.board.removeBlock(sector);
  ctx.events.emit('blockDestroyed', { sector, blockType: block.type, hp: block.hp });
  RelicSystem.onBlockDestroyed(block, sector, ctx);
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
  let hp = def.hp;
  let attack = def.attack;
  return createBlock(type, hp, attack);
}

export function createPlacedPressureStone(sector: number, dragons: DragonState[], rotationDeg: number = 0): BlockData {
  let totalHp = 0;
  for (const edgeIndex of [sector, (sector - 1 + 8) % 8, (sector + 1) % 8]) {
    const dragon = dragons.find(d => d.isAlive && dragonEdgeToBoardSector(d.edgeIndex, rotationDeg) === edgeIndex);
    if (dragon) totalHp += dragon.hp;
  }
  return createBlock(BlockType.PRESSURE_STONE, Math.floor(totalHp / 4), 0);
}

export function findDragonAtBoardSector(dragons: DragonState[], sector: number, rotationDeg: number = 0): DragonState | undefined {
  return dragons.find(d => d.isAlive && dragonEdgeToBoardSector(d.edgeIndex, rotationDeg) === sector);
}

export function moveDragonInContext(dragon: DragonState, targetEdge: number, ctx: EffectContext): void {
  const normalizedTarget = normalizeSector(targetEdge);
  if (!dragon.isAlive || dragon.edgeIndex === normalizedTarget) return;
  const used = ctx.state.aliveDragons.some(other => other !== dragon && other.edgeIndex === normalizedTarget);
  if (used) return;
  const from = dragon.edgeIndex;
  triggerSpikesAt(dragonEdgeToBoardSector(from, ctx.state.rotationAngle), dragon, ctx);
  if (!dragon.isAlive) return;
  dragon.edgeIndex = normalizedTarget;
  triggerSpikesAt(dragonEdgeToBoardSector(dragon.edgeIndex, ctx.state.rotationAngle), dragon, ctx);
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
    damageDragon(target, damage, ctx, `步兵协同对 ${target.name} 造成 ${damage} 伤害`, 'infantry_assist');
  }
}

function triggerSpikesAt(sector: number, dragon: DragonState, ctx: EffectContext): void {
  const block = ctx.board.getSector(sector);
  if (!block || block.type !== BlockType.SPIKES || !dragon.isAlive) return;
  const damage = getBlockAttack(block, ctx, sector);
  if (damage <= 0) return;
  damageDragon(dragon, damage, ctx, `地刺对 ${dragon.name} 造成 ${damage} 伤害`, 'spikes');
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
  onTurnStart(block, sector, ctx) {
    if (RelicSystem.getMineAttackBonus(ctx.state) <= 0) return;
    for (const adjacent of [(sector + 7) % 8, (sector + 1) % 8]) {
      const target = ctx.board.getSector(adjacent);
      if (target?.type !== BlockType.POWER_STONE) continue;
      damageBlockInContext(target, adjacent, getBlockAttack(block, ctx, sector), ctx, { block });
    }
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
    const rotatedSectors = Math.abs(ctx.state.turnRotationSteps) % 8;
    const gain = rotatedSectors * 2 * RelicSystem.getKnightRotationMultiplier(ctx.state);
    if (gain <= 0) return;
    block.hp += gain;
    block.tempHp += gain;
    block.turnAttackBonus += gain;
  },
});

registerBlockEffect({
  type: BlockType.MAGE,
  describe: () => ['每回合使商店中的飞弹 +2 临时攻击力'],
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
  describe: () => ['若放置的扇区中有龙，在临时槽生成 1 张 5 金币的【驱离】', '驱离只能影响生成时绑定类型的龙'],
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
    ctx.applyVillageHpDelta(-block.hp);
    ctx.addMessage(`龙焰对村庄造成 ${block.hp} 伤害`);
  },
});

registerBlockEffect({ type: BlockType.WOOD_WALL, describe: () => ['8 HP，0 攻击力'] });
registerBlockEffect({ type: BlockType.SPIKES, describe: () => ['有任意单位进入/离开此扇区时，地刺会攻击它'] });
registerBlockEffect({ type: BlockType.SMITHY, describe: () => ['相邻扇区放置建筑/单位时，使其获得铁匠铺当前攻击力，并使铁匠铺 +1 攻击力'] });
registerBlockEffect({ type: BlockType.ASSASSIN, describe: () => ['黑夜时 +35 攻击力', '攻击 1 次后销毁自身'] });
registerBlockEffect({ type: BlockType.SENSING_WALL, describe: () => ['任意空地即将被攻击时，自动移动到该空地抵挡', '最多只能同时存在 1 个'] });
registerBlockEffect({
  type: BlockType.DRAGON_SPEAR,
  describe: () => ['每次攻击前，每有 1 个空地获得 10 临时攻击力', '若攻击击杀任意龙，本轮剩余龙行动全部跳过'],
  beforeAttack(block, _sector, ctx) {
    block.turnAttackBonus += ctx.board.getEmptySectors().length * 10;
  },
});
registerBlockEffect({ type: BlockType.INFANTRY, describe: () => ['两边相邻扇区的友方攻击时，自身也对其目标攻击 1 次'] });
registerBlockEffect({ type: BlockType.WEAKNESS, describe: () => ['暂无效果'] });
registerBlockEffect({
  type: BlockType.PRIEST,
  describe: () => ['在白天区域时，每回合使村庄获得 3 点治疗'],
  onTurnStart(_block, sector, ctx) {
    if (ctx.isNight(sector)) return;
    ctx.applyVillageHpDelta(3);
    ctx.addMessage('牧师治疗村庄 3 点生命');
  },
});
registerBlockEffect({ type: BlockType.GHOST, describe: () => ['在黑夜区域时，具有亡语：在此扇区召唤 1 只 1 HP 幽灵，并获得自身攻击'] });
registerBlockEffect({ type: BlockType.GOBLIN, describe: () => ['放置后：你购买的下一个商品金币消耗 -10'] });
registerBlockEffect({ type: BlockType.MARKET, describe: () => ['每回合可以免费刷新 1 次'] });
