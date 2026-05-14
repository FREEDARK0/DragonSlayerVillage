import { BLOCK_TYPE_TABLE, BlockTag, BlockType } from '../config/blockTypes';
import { BlockData, createBlock } from '../models/Block';
import { DragonState, dragonTakeDamage, markDragonDefeated } from '../models/Dragon';
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

export type BlockAttackSource = 'player_phase' | 'portal' | 'first_strike';

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
  describe?(level?: number): string[];
  income?(block: BlockData, sector: number, ctx: IncomeEffectContext): number;
  onPlayerPhase?(block: BlockData, sector: number, ctx: EffectContext): void;
  onCooldown?(block: BlockData, sector: number, ctx: EffectContext): void;
  attackDragon?(attack: BlockDragonAttack): BlockDragonAttackResult;
  modifyIncomingDamage?(hit: DragonBreathHit, ctx: EffectContext): number;
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

const BASE_VILLAGE_INCOME = 10;

export function calculateVillageIncome(ctx: IncomeEffectContext): number {
  let income = BASE_VILLAGE_INCOME;
  ctx.board.forEach((block, sector) => {
    if (!block) return;
    income += getBlockEffect(block.type)?.income?.(block, sector, ctx) ?? 0;
  });
  return income;
}

export function applyBlockDestroyed(block: BlockData, sector: number, ctx: EffectContext, destroyedCombatPower?: number): void {
  getBlockEffect(block.type)?.onDestroyed?.(block, sector, ctx, destroyedCombatPower);
  if (!isGuardianTriggerBlock(block)) return;
  ctx.board.forEach(otherBlock => {
    if (otherBlock?.type === BlockType.GUARDIAN) otherBlock.combatPower += 1;
  });
}

export function applyBreathHit(hit: DragonBreathHit, ctx: EffectContext): void {
  getBlockEffect(hit.block.type)?.onBreathHit?.(hit, ctx);
}

export function attackDragonWithBlock(block: BlockData, sector: number, target: DragonState, ctx: EffectContext, source: BlockAttackSource): BlockDragonAttackResult {
  return getBlockEffect(block.type)?.attackDragon?.({ block, sector, target, ctx, source }) ?? { attacked: false, damage: 0 };
}

export function canBlockAttackDragon(block: BlockData): boolean {
  return Boolean(getBlockEffect(block.type)?.attackDragon);
}

export function modifyIncomingBlockDamage(hit: DragonBreathHit, ctx: EffectContext): number {
  return getBlockEffect(hit.block.type)?.modifyIncomingDamage?.(hit, ctx) ?? hit.damage;
}

export function destroyBlockInContext(block: BlockData, sector: number, ctx: EffectContext, destroyedCombatPower?: number): void {
  ctx.board.removeBlock(sector);
  ctx.events.emit('blockDestroyed', { sector, blockType: block.type, combatPower: block.combatPower });
  applyBlockDestroyed(block, sector, ctx, destroyedCombatPower);
}

function damageDragon(dragon: DragonState, damage: number, ctx: EffectContext, message: string): void {
  dragonTakeDamage(dragon, damage);
  ctx.addMessage(message);
  ctx.events.emit('dragonDamaged', { dragonId: dragon.id, damage });
  if (dragon.combatPower <= 0) {
    markDragonDefeated(dragon, ctx.state.turnNumber + 6);
    ctx.events.emit('dragonDied', { dragonId: dragon.id });
  }
}

function attackMessage(source: BlockAttackSource, actor: string, target: DragonState, damage: number): string {
  if (source === 'portal') return `通道触发，${actor}对 ${target.name} 造成 ${damage} 伤害`;
  if (source === 'first_strike') return `${actor}先攻对 ${target.name} 造成 ${damage} 伤害`;
  return `${actor}对 ${target.name} 造成 ${damage} 伤害`;
}

export function getBlockEffectDescriptions(type: BlockType, level: number = 1): string[] {
  return getBlockEffect(type)?.describe?.(level) ?? ['暂无主动效果', '可叠加同类地块提升等级'];
}

export function calculatePressureStoneCombatPower(level: number, sector: number, dragons: DragonState[]): number {
  let total = 0;
  for (const edgeIndex of [sector, (sector - 1 + 8) % 8, (sector + 1) % 8]) {
    const dragon = dragons.find(d => d.edgeIndex === edgeIndex);
    if (dragon) total += dragon.combatPower;
  }
  return Math.round(total * levelValue(level, [0.2, 0.3, 0.4]));
}

export function combatPowerForLevel(type: BlockType, level: number): number {
  const lv = Math.max(1, Math.min(MAX_BLOCK_LEVEL, level));
  if (type === BlockType.WOOD_WALL) return levelValue(lv, [10, 25, 50]);
  if (type === BlockType.BALLISTA) return levelValue(lv, [5, 15, 30]);
  if (type === BlockType.MINE) return 10;
  if (type === BlockType.SMITHY) return levelValue(lv, [10, 20, 30]);
  if (type === BlockType.PRESSURE_STONE) return 0;
  if (type === BlockType.ASSASSIN) return 0;
  if (type === BlockType.DRAGON_SPEAR) return 5;
  if (type === BlockType.SENSING_WALL) return 20;
  if (type === BlockType.DRAGON_FIRE) return 10;
  return defaultCombatPower(type);
}

function defaultCombatPower(type: BlockType): number {
  return BLOCK_TYPE_TABLE[type].defaultPower;
}

export function refreshBlockForLevel(block: BlockData, level: number): void {
  const lv = Math.max(1, Math.min(MAX_BLOCK_LEVEL, level));
  const currentCombatPower = block.combatPower;
  block.level = lv;
  block.combatPower = block.type === BlockType.PRESSURE_STONE
    ? currentCombatPower
    : block.type === BlockType.DRAGON_SPEAR
      ? Math.max(currentCombatPower, combatPowerForLevel(block.type, lv))
      : combatPowerForLevel(block.type, lv);
  block.tags = [...(BLOCK_TYPE_TABLE[block.type].tags ?? [])];
  if (block.type === BlockType.BALLISTA) block.cooldown = 0;
  if (block.type === BlockType.SMITHY && block.smithyPlacementBonus === undefined) block.smithyPlacementBonus = 1;
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
      '白天收入: +1',
      `夜晚收入: +${levelValue(level, [15, 20, 30])}`,
    ];
  },
  income(block, sector, ctx) {
    const level = blockLevel(block);
    return ctx.isNight(sector) ? levelValue(level, [15, 20, 30]) : 1;
  },
});

registerBlockEffect({
  type: BlockType.KNIGHT,
  describe(level = 1) {
    return [
      `每旋转1步成长 +${levelValue(level, [1, 2, 3])}`,
      '随本回合旋转步数提升战力',
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
      '伤害=自身+左右相邻战力，攻击面前两边',
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    for (const edgeIndex of [sector, (sector + 1) % 8]) {
      const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === edgeIndex);
      if (dragon) attackDragonWithBlock(block, sector, dragon, ctx, 'player_phase');
    }
  },
  attackDragon({ block, sector, target, ctx, source }) {
    const left = ctx.board.getSector((sector - 1 + 8) % 8);
    const right = ctx.board.getSector((sector + 1) % 8);
    const baseDamage = block.combatPower + (left?.combatPower ?? 0) + (right?.combatPower ?? 0);
    const damage = Math.round(baseDamage * levelValue(blockLevel(block), [1, 1.5, 2]));
    damageDragon(target, damage, ctx, attackMessage(source, '法师', target, damage));
    return { attacked: true, damage };
  },
});

registerBlockEffect({
  type: BlockType.BALLISTA,
  describe(level = 1) {
    return [
      `战力: ${levelValue(level, [5, 15, 30])}`,
      `伤害: 战力 x${levelValue(level, [2, 3, 3])}`,
      `冷却: ${levelValue(level, [2, 2, 1])}回合`,
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === sector);
    if (!dragon) return;
    attackDragonWithBlock(block, sector, dragon, ctx, 'player_phase');
  },
  attackDragon({ block, target, ctx, source }) {
    if (block.cooldown > 0) return { attacked: false, damage: 0 };
    const level = blockLevel(block);
    const damage = block.combatPower * levelValue(level, [2, 3, 3]);
    damageDragon(target, damage, ctx, attackMessage(source, '巨弩', target, damage));
    block.cooldown = levelValue(level, [2, 2, 1]);
    return { attacked: true, damage };
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
      '放置时按当前边与相邻边龙战力生成战力',
      '一次性结算，后续不会自动更新',
    ];
  },
});

registerBlockEffect({
  type: BlockType.ASSASSIN,
  describe(level = 1) {
    return [
      '白天战力: 0',
      `夜晚伤害: ${levelValue(level, [100, 150, 200])}`,
      '带【先攻】标签',
      '触发后自毁',
    ];
  },
  onPlayerPhase(block, sector, ctx) {
    const dragon = ctx.state.aliveDragons.find(d => d.edgeIndex === sector);
    if (dragon) attackDragonWithBlock(block, sector, dragon, ctx, 'player_phase');
  },
  attackDragon({ block, sector, target, ctx, source }) {
    const damage = ctx.isNight(sector) ? levelValue(blockLevel(block), [100, 150, 200]) : 0;
    block.combatPower = damage;
    damageDragon(target, damage, ctx, attackMessage(source, '刺客', target, damage));
    destroyBlockInContext(block, sector, ctx, block.combatPower);
    return { attacked: true, damage };
  },
});

registerBlockEffect({
  type: BlockType.DRAGON_SPEAR,
  describe(level = 1) {
    return [
      '基础战力: 5',
      `每个空位额外 +${levelValue(level, [10, 15, 20])} 战力`,
      '带【先攻】标签',
      '击杀任意龙时，跳过本轮剩余龙行动',
    ];
  },
  attackDragon({ block, target, ctx, source }) {
    const gainedPower = ctx.board.getEmptySectors().length * levelValue(blockLevel(block), [10, 15, 20]);
    if (gainedPower > 0) block.combatPower += gainedPower;
    const damage = block.combatPower;
    damageDragon(target, damage, ctx, attackMessage(source, '龙枪', target, damage));
    if (!target.isAlive) ctx.state.skipRemainingDragonActions = true;
    return { attacked: true, damage };
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
  describe() {
    return [
      '被吐息命中时，对侧可攻击友方反击攻击龙',
      '自身仍会承受本次吐息伤害',
    ];
  },
  onBreathHit(hit, ctx) {
    if (hit.mode !== 'damage') return;
    const opposite = (hit.sector + 4) % 8;
    const ally = ctx.board.getSector(opposite);
    if (!ally || !isFriendlyBlock(ally) || !canBlockAttackDragon(ally)) return;
    attackDragonWithBlock(ally, opposite, hit.dragon, ctx, 'portal');
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
    if (hit.dragon.combatPower <= 0) {
      markDragonDefeated(hit.dragon, ctx.state.turnNumber + 6);
      ctx.events.emit('dragonDied', { dragonId: hit.dragon.id });
    }
  },
});

registerBlockEffect({
  type: BlockType.POWER_STONE,
  describe(level = 1) {
    return [
      '生成时随机获得 1-20 战力',
      `销毁收益: 生成战力 x${level}`,
    ];
  },
  onDestroyed(block, _sector, ctx) {
    const gain = (block.generatedCombatPower ?? block.combatPower) * blockLevel(block);
    ctx.state.applyVillagePowerDelta(gain, 'battle');
    ctx.addMessage(`金矿 +${gain} → 村庄`);
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
    ctx.state.applyVillagePowerDelta(-block.combatPower, 'battle');
    ctx.addMessage(`龙焰对村庄造成 ${block.combatPower} 伤害`);
  },
});

registerBlockEffect({ type: BlockType.VOODOO, describe: () => ['暂无主动效果', '可叠加同类地块提升等级'] });
registerBlockEffect({ type: BlockType.WEAKNESS, describe: () => ['暂无主动效果', '可叠加同类地块提升等级'] });
registerBlockEffect({
  type: BlockType.WOOD_WALL,
  describe(level = 1) {
    return [
      `战力: ${levelValue(level, [10, 25, 50])}`,
      '阻挡吐息，升级会恢复到满战力',
    ];
  },
});
registerBlockEffect({
  type: BlockType.GUARDIAN,
  describe: () => ['任意友方地块被销毁时，自身 +1 战力', '受到伤害时不损失战力'],
  modifyIncomingDamage() {
    return 0;
  },
});
registerBlockEffect({
  type: BlockType.SMITHY,
  describe(level = 1) {
    return [
      `战力: ${levelValue(level, [10, 20, 30])}`,
      '相邻扇区放置或升级友方建筑/单位时，目标额外 +当前加成 战力',
      '每次触发后，该铁匠铺当前加成 +1（初始 +1）',
    ];
  },
});
registerBlockEffect({
  type: BlockType.SENSING_WALL,
  describe: () => ['空位受龙攻击时自动移入抵挡', '带【无法攻击】标签'],
});

export function createPlacedBlock(type: BlockType, level: number = 1): BlockData {
  const block = createBlock(type, combatPowerForLevel(type, level), level);
  refreshBlockForLevel(block, level);
  if (type === BlockType.SMITHY) block.smithyPlacementBonus = 1;
  return block;
}

function isGuardianTriggerBlock(block: BlockData): boolean {
  return block.type !== BlockType.DRAGON_FIRE && block.type !== BlockType.WEAKNESS;
}
