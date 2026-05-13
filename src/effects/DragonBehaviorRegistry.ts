import { BlockType } from '../config/blockTypes';
import { DragonPersonalityType } from '../config/dragonTypes';
import { DragonState } from '../models/Dragon';
import { createPowerStone } from '../models/Block';
import { EffectContext } from './EffectContext';

export interface DragonBehaviorDefinition {
  type: DragonPersonalityType;
  breathPower(dragon: DragonState): number;
  describe(dragon: DragonState, targets: number[]): string;
  effectDescriptions?(dragon: DragonState): string[];
  onEmptySectorHit?(dragon: DragonState, sector: number, damage: number, ctx: EffectContext): void;
  afterAction?(dragon: DragonState, ctx: EffectContext): void;
  afterBlockDestroyed?(dragon: DragonState, sector: number, ctx: EffectContext): void;
  shouldLeaveAfterTurn?(dragon: DragonState, ctx: EffectContext): boolean;
}

const definitions = new Map<DragonPersonalityType, DragonBehaviorDefinition>();

export function registerDragonBehavior(definition: DragonBehaviorDefinition): void {
  definitions.set(definition.type, definition);
}

export function getDragonBehavior(type: DragonPersonalityType): DragonBehaviorDefinition {
  return definitions.get(type) ?? defaultBehavior;
}

export function getAllDragonBehaviors(): DragonBehaviorDefinition[] {
  return [...definitions.values()];
}

const defaultBehavior: DragonBehaviorDefinition = {
  type: DragonPersonalityType.ARROGANT,
  breathPower() {
    return 1;
  },
  describe(dragon, targets) {
    return `${dragon.name}吐息！覆盖 ${targets.length} 个扇形`;
  },
  effectDescriptions() {
    return ['标准吐息，攻击面前扇区'];
  },
};

registerDragonBehavior({
  type: DragonPersonalityType.ARROGANT,
  breathPower() {
    return 2;
  },
  describe(dragon, targets) {
    return `${dragon.name}高傲吐息！中心伤害，两侧转为强化`;
  },
  afterAction(dragon) {
    dragon.attackMultiplier *= 1.1;
  },
  effectDescriptions(dragon) {
    return [
      `固定攻击 3 个扇区`,
      `中心正常伤害，两侧命中地块改为增加战力`,
      `攻击后攻击倍率 x1.1（当前 ${dragon.attackMultiplier.toFixed(2)}）`,
    ];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.GLUTTONOUS,
  breathPower() {
    return 1;
  },
  describe(dragon) {
    return `${dragon.name}贪食吐息！`;
  },
  effectDescriptions(dragon) {
    return [
      '攻击后吞噬白天区域的其他龙，获得其当前战力并移动到其位置',
      `攻击 2 次后离开（已攻击 ${dragon.attackCount}/2）`,
    ];
  },
  shouldLeaveAfterTurn(dragon) {
    return dragon.attackCount >= 2;
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.DESTRUCTIVE,
  breathPower(dragon) {
    return dragon.turnCounter % 2 === 0 ? 2 : 1;
  },
  describe(dragon) {
    return `${dragon.name}破坏吐息！`;
  },
  effectDescriptions() {
    return [
      '吐息范围在 1 扇区与 3 扇区之间交替变化',
      '击破地块后顺时针移动并继续攻击',
      '场上地块少于 3 个时离开',
    ];
  },
  shouldLeaveAfterTurn(_dragon, ctx) {
    return ctx.board.findAllSectors(block => block !== null).length < 3;
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.GOLD,
  breathPower() {
    return 1;
  },
  describe(dragon) {
    return `${dragon.name}洒下金色吐息！`;
  },
  onEmptySectorHit(_dragon, sector, _damage, ctx) {
    ctx.board.setSector(sector, createPowerStone());
  },
  effectDescriptions() {
    return ['吐息命中的空位生成 1 级随机战力金矿', '空位仍会承受对村庄的吐息伤害'];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.WYVERN,
  breathPower() {
    return 1;
  },
  describe(dragon, targets) {
    return `${dragon.name}俯冲吐息！覆盖 ${targets.length} 个扇形`;
  },
  shouldLeaveAfterTurn(dragon) {
    return dragon.hasTakenDamage;
  },
  effectDescriptions(dragon) {
    return [`受伤后离开（${dragon.hasTakenDamage ? '已受伤' : '尚未受伤'}）`];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.BRUTAL,
  breathPower() {
    return 1;
  },
  describe(dragon) {
    return `${dragon.name}喷吐残暴龙焰！`;
  },
  effectDescriptions() {
    return ['攻击区域空位生成 10 战力龙焰', '已有龙焰会继续叠加 10 战力'];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.SUN,
  breathPower() {
    return 1;
  },
  describe(dragon, targets) {
    return `${dragon.name}释放耀光吐息！覆盖 ${targets.length} 个扇形`;
  },
  effectDescriptions() {
    return ['释放耀光吐息'];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.DARK,
  breathPower() {
    return 1;
  },
  describe(dragon, targets) {
    return `${dragon.name}释放暗影吐息！覆盖 ${targets.length} 个扇形`;
  },
  effectDescriptions() {
    return ['释放暗影吐息'];
  },
});
