import { BLOCK_TYPE_TABLE, BlockTag, BlockType } from '../config/blockTypes';
import { BlockData, createBlock } from '../models/Block';
import { DragonState, dragonTakeDamage } from '../models/Dragon';
import { EffectContext, IncomeEffectContext } from './EffectContext';

export const MAX_BLOCK_LEVEL = 3;

const LEVEL_INDEX = [0, 0, 1, 2] as const;

function blockLevel(block: Pick<BlockData, 'level'>): number {
  return Math.max(1, Math.min(MAX_BLOCK_LEVEL, block.level ?? 1));
}

function levelIndex(level: number): 0 | 1 | 2 {
  return LEVEL_INDEX[Math.max(1, Math.min(MAX_BLOCK_LEVEL, level))] as 0 | 1 | 2;
}

function levelValue(level: number, values: [number, number, number]): number {
  return values[levelIndex(level)];
}

export interface DragonBreathHit {
  dragon: DragonState;
  sector: number;
  block: BlockData;
  damage: number;
  allDragons: DragonState[];
  mode: 'damage' | 'increase';
}

export interface BlockEffectDefinition {
  type: BlockType;
  describe?(level?: number): string[];
  income?(block: BlockData, sector: number, ctx: IncomeEffectContext): number;
  onPlayerPhase?(block: BlockData, sector: number, ctx: EffectContext): void;
  onCooldown?(block: BlockData, sector: number, ctx: EffectContext): void;
  onBreathHit?(hit: DragonBreathHit, ctx: EffectContext): void;
  onDestroyed?(block: BlockData, sector: number, ctx: EffectContext, destroyedCombatPower?: number): void;
}

const definitions = new Map<BlockType, BlockEffectDefinition>();

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
  let income = 5;
  ctx.board.forEach((block, sector) => {
    if (!block) return;
    income += getBlockEffect(block.type)?.income?.(block, sector, ctx) ?? 0;
  });
  return income;
}

export function applyBlockDestroyed(block: BlockData, sector: number, ctx: EffectContext, destroyedCombatPower?: number): void {
  getBlockEffect(block.type)?.onDestroyed?.(block, sector, ctx, destroyedCombatPower);
}

export function applyBreathHit(hit: DragonBreathHit, ctx: EffectContext): void {
  getBlockEffect(hit.block.type)?.onBreathHit?.(hit, ctx);
}

function damageDragon(dragon: DragonState, damage: number, ctx: EffectContext, message: string): void {
  dragonTakeDamage(dragon, damage);
  ctx.addMessage(message);
  ctx.events.emit('dragonDamaged', { dragonId: dragon.id, damage });
  if (!dragon.isAlive) ctx.events.emit('dragonDied', { dragonId: dragon.id });
}

export function getBlockEffectDescriptions(type: BlockType, level: number = 1): string[] {
  return getBlockEffect(type)?.describe?.(level) ?? ['暂无主动效果', '可叠加同类地块提升等级'];
}

export function combatPowerForLevel(type: BlockType, level: number): number {
  const lv = Math.max(1, Math.min(MAX_BLOCK_LEVEL, level));
  if (type === BlockType.WOOD_WALL) return levelValue(lv, [10, 25, 50]);
  if (type === BlockType.BALLISTA) return levelValue(lv, [5, 15, 30]);
  if (type === BlockType.MINE) return 10;
  if (type === BlockType.PRESSURE_STONE) return 0;
  if (type === BlockType.ASSASSIN) return levelValue(lv, [9, 18, 27]);
  if (type === BlockType.SENSING_WALL) return 20;
  if (type === BlockType.DRAGON_FIRE) return 10;
  return defaultCombatPower(type);
}

function defaultCombatPower(type: BlockType): number {
  return BLOCK_TYPE_TABLE[type].defaultPower;
}

export function refreshBlockForLevel(block: BlockData, level: number): void {
  const lv = Math.max(1, Math.min(MAX_BLOCK_LEVEL, level));
  block.level = lv;
  block.combatPower = combatPowerForLevel(block.type, lv);
  block.tags = [...(BLOCK_TYPE_TABLE[block.type].tags ?? [])];
  if (block.type === BlockType.BALLISTA) block.cooldown = 0;
}

export function hasBlockTag(block: BlockData, tag: BlockTag): boolean {
  return block.tags.includes(tag);
}

export function isFriendlyBlock(block: BlockData | null): block is BlockData {
  if (!block) return false;
  return block.type !== BlockType.POWER_STONE && block.type !== BlockType.WEAKNESS && block.type !== BlockType.DRAGON_FIRE;
}

export function createDragonFire(combatPower: number = 10): BlockData {
  return createBlock(BlockType.DRAGON_FIRE, combatPower);
}

registerBlockEffect({
  type: BlockType.MINE,
  describe(level = 1) {
    return [
      `收入: +${levelValue(level, [2, 4, 6])}/回合`,
      'Lv1/Lv2/Lv3: +2/+4/+6',
    ];
  },
  income(block) {
    return levelValue(blockLevel(block), [2, 4, 6]);
  },
});

registerBlockEffect({
  type: BlockType.TAVERN,
  describe(level = 1) {
    return [
      `白天收入: +${levelValue(level, [5, 10, 15])}`,
      `夜晚收入: +${levelValue(level, [15, 25, 35])}`,
    ];
  },
  income(block, sector, ctx) {
    const level = blockLevel(block);
    return ctx.isNight(sector) ? levelValue(level, [15, 25, 35]) : levelValue(level, [5, 10, 15]);
  },
});

registerBlockEffect({
  type: BlockType.KNIGHT,
  describe(level = 1) {
    return [
      `每旋转1步成长 +${levelValue(level, [1, 2, 3])}`,
      '随本回合旋转步数提升耐久与力量',
    ];
  },
  onPlayerPhase(block, _sector, ctx) {
    const gain = Math.abs(ctx.state.turnRotationSteps) * blockLevel(block);
    block.combatPower += gain;
  },
});

registerBlockEffect({
  type: BlockType.MAGE,
  describe(level = 1) {
    return [
      `伤害倍率: x${levelValue(level, [1, 1.5, 2])}`,
      '伤害=自身+左右相邻力量，攻击面前两边',
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    const left = ctx.board.getSector((sector - 1 + 8) % 8);
    const right = ctx.board.getSector((sector + 1) % 8);
    const baseDamage = block.combatPower + (left?.combatPower ?? 0) + (right?.combatPower ?? 0);
    const damage = Math.round(baseDamage * levelValue(blockLevel(block), [1, 1.5, 2]));
    for (const edgeIndex of [sector, (sector + 1) % 8]) {
      const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === edgeIndex);
      if (dragon) damageDragon(dragon, damage, ctx, `法师对 ${dragon.name} 造成 ${damage} 伤害`);
    }
  },
});

registerBlockEffect({
  type: BlockType.BALLISTA,
  describe(level = 1) {
    return [
      `力量: ${levelValue(level, [5, 15, 30])}`,
      `伤害: 力量 x${levelValue(level, [2, 3, 3])}`,
      `冷却: ${levelValue(level, [2, 2, 1])}回合`,
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    if (block.cooldown > 0) return;
    const level = blockLevel(block);
    const damage = block.combatPower * levelValue(level, [2, 3, 3]);
    const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === sector);
    if (!dragon) return;
    damageDragon(dragon, damage, ctx, `巨弩对 ${dragon.name} 造成 ${damage} 伤害`);
    block.cooldown = levelValue(level, [2, 2, 1]);
  },
  onCooldown(block) {
    if (block.cooldown > 0) block.cooldown--;
  },
});

registerBlockEffect({
  type: BlockType.PRESSURE_STONE,
  describe(level = 1) {
    return [
      `转化率: ${levelValue(level, [20, 30, 40])}%`,
      '按当前边与相邻边龙战力生成力量',
    ];
  },
  onCooldown(block, sector, ctx) {
    let total = 0;
    for (const edgeIndex of [sector, (sector - 1 + 8) % 8, (sector + 1) % 8]) {
      const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === edgeIndex);
      if (dragon) total += dragon.combatPower;
    }
    block.combatPower = Math.round(total * levelValue(blockLevel(block), [0.2, 0.3, 0.4]));
  },
});

registerBlockEffect({
  type: BlockType.ASSASSIN,
  describe(level = 1) {
    return [
      `白天伤害: ${levelValue(level, [9, 18, 27])}`,
      `夜晚伤害: ${levelValue(level, [100, 150, 200])}`,
      '触发后自毁',
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    const level = blockLevel(block);
    const damage = ctx.isNight(sector) ? levelValue(level, [100, 150, 200]) : levelValue(level, [9, 18, 27]);
    block.combatPower = damage;
    const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === sector);
    if (dragon) damageDragon(dragon, damage, ctx, `刺客对 ${dragon.name} 造成 ${damage} 伤害！`);
    ctx.board.removeBlock(sector);
    ctx.events.emit('blockDestroyed', { sector, blockType: block.type, combatPower: block.combatPower });
  },
});

registerBlockEffect({
  type: BlockType.BELLOWS,
  describe(level = 1) {
    return [
      `推动距离: ${levelValue(level, [1, 2, 3])}边`,
      '推动当前边上的龙，目标边被占用则不移动',
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === sector);
    if (!dragon) return;
    const direction = block.direction ?? 1;
    const newEdge = ((dragon.edgeIndex + direction * blockLevel(block)) % 8 + 8) % 8;
    if (!ctx.state.aliveDragons.find(d => d.edgeIndex === newEdge && d !== dragon)) {
      dragon.edgeIndex = newEdge;
    }
  },
});

registerBlockEffect({
  type: BlockType.PORTAL,
  describe(level = 1) {
    return [
      `转移伤害: ${levelValue(level, [100, 150, 200])}%`,
      '被吐息命中时，把伤害转移给对侧龙',
    ];
  },
  onBreathHit(hit, ctx) {
    if (hit.mode !== 'damage') return;
    const opposite = (hit.sector + 4) % 8;
    const dragon = hit.allDragons.find(d => d.isAlive && d.edgeIndex === opposite);
    if (!dragon) return;
    const damage = Math.round(hit.damage * levelValue(blockLevel(hit.block), [1, 1.5, 2]));
    dragonTakeDamage(dragon, damage);
    ctx.events.emit('dragonDamaged', { dragonId: dragon.id, damage });
    if (!dragon.isAlive) ctx.events.emit('dragonDied', { dragonId: dragon.id });
  },
});

registerBlockEffect({
  type: BlockType.SPIKES,
  describe(level = 1) {
    return [
      `反伤: ${levelValue(level, [1, 2, 3])}`,
      '被吐息命中时反伤攻击者',
    ];
  },
  onBreathHit(hit, ctx) {
    if (hit.mode !== 'damage') return;
    const damage = levelValue(blockLevel(hit.block), [1, 2, 3]);
    dragonTakeDamage(hit.dragon, damage);
    ctx.events.emit('dragonDamaged', { dragonId: hit.dragon.id, damage });
    if (!hit.dragon.isAlive) ctx.events.emit('dragonDied', { dragonId: hit.dragon.id });
  },
});

registerBlockEffect({
  type: BlockType.POWER_STONE,
  describe(level = 1) {
    return [
      `销毁收益: 储存战力 x${level}`,
      '被摧毁后把战力注入村庄',
    ];
  },
  onDestroyed(block, _sector, ctx, destroyedCombatPower) {
    if (block.combatPower <= 0) {
      const gain = Math.max(0, destroyedCombatPower ?? block.combatPower) * blockLevel(block);
      ctx.board.villagePower += gain;
      ctx.addMessage(`金矿 +${gain} → 村庄`);
    }
  },
});

registerBlockEffect({
  type: BlockType.DRAGON_FIRE,
  describe() {
    return [
      '每回合对村庄造成等同战力的伤害',
      '建筑放置到此处会改为削减龙焰',
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    ctx.board.villagePower -= block.combatPower;
    ctx.addMessage(`龙焰对村庄造成 ${block.combatPower} 伤害`);
  },
});

registerBlockEffect({ type: BlockType.VOODOO, describe: () => ['暂无主动效果', '可叠加同类地块提升等级'] });
registerBlockEffect({ type: BlockType.WEAKNESS, describe: () => ['暂无主动效果', '可叠加同类地块提升等级'] });
registerBlockEffect({
  type: BlockType.WOOD_WALL,
  describe(level = 1) {
    return [
      `耐久: ${levelValue(level, [10, 25, 50])}`,
      '阻挡吐息，升级会恢复到满耐久',
    ];
  },
});
registerBlockEffect({ type: BlockType.PRIEST, describe: () => ['暂无主动效果', '可叠加同类地块提升等级'] });
registerBlockEffect({
  type: BlockType.SENSING_WALL,
  describe: () => ['空位受龙攻击时自动移入抵挡', '带【无法攻击】标签'],
});

export function createPlacedBlock(type: BlockType, level: number = 1): BlockData {
  const block = createBlock(type, combatPowerForLevel(type, level), level);
  refreshBlockForLevel(block, level);
  return block;
}
