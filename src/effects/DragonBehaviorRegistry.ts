import { DragonPersonalityType } from '../config/dragonTypes';
import { DragonState } from '../models/Dragon';
import { createGoldMine } from './BlockEffectRegistry';
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

export function dragonBehaviorHasExplicitLeaveCondition(type: DragonPersonalityType): boolean {
  return definitions.get(type)?.shouldLeaveAfterTurn !== undefined;
}

const defaultBehavior: DragonBehaviorDefinition = {
  type: DragonPersonalityType.WYVERN,
  breathPower(dragon) {
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon, targets) {
    return `${dragon.name}吐息！覆盖 ${targets.length} 个扇区`;
  },
  effectDescriptions() {
    return ['标准吐息，按攻击力造成伤害'];
  },
};

registerDragonBehavior({
  type: DragonPersonalityType.ARROGANT,
  breathPower(dragon) {
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon, targets) {
    return `${dragon.name}高傲吐息！覆盖 ${targets.length} 个扇区`;
  },
  afterAction(dragon) {
    dragon.attack += 5;
  },
  effectDescriptions(dragon) {
    return [
      '只会出现在攻击力最高友方所在扇区附近',
      '击破任意建筑/单位时会重新选择攻击力最高的目标',
      `每次攻击后 +5 攻击力（当前 ${dragon.attack}）`,
    ];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.GLUTTONOUS,
  breathPower(dragon) {
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon) {
    return `${dragon.name}贪食吐息！`;
  },
  effectDescriptions(dragon) {
    return [
      '攻击后吞噬最近的白天区域其他龙，获得其 HP 和攻击力',
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
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon) {
    return `${dragon.name}破坏吐息！`;
  },
  effectDescriptions() {
    return [
      '固定攻击 3 个扇区',
      '击破地块后顺时针移动 1 边并继续攻击',
    ];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.GOLD,
  breathPower(dragon) {
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon) {
    return `${dragon.name}洒下金色吐息！`;
  },
  onEmptySectorHit(_dragon, sector, _damage, ctx) {
    if (!ctx.board.getSector(sector)) ctx.board.setSector(sector, createGoldMine());
  },
  effectDescriptions() {
    return ['吐息命中空地并造成伤害后，该空地生成 1 个金矿'];
  },
});

registerDragonBehavior({
  type: DragonPersonalityType.WYVERN,
  breathPower(dragon) {
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon, targets) {
    return `${dragon.name}俯冲吐息！覆盖 ${targets.length} 个扇区`;
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
  breathPower(dragon) {
    return breathPowerFromSectorRange(dragon.breathRange);
  },
  describe(dragon) {
    return `${dragon.name}喷吐龙焰！`;
  },
  effectDescriptions() {
    return ['攻击结算后，在攻击范围空地生成 10 HP 龙焰', '已有龙焰则 +10 HP'];
  },
});

function breathPowerFromSectorRange(range: number): number {
  return Math.max(1, Math.ceil(range / 2));
}
