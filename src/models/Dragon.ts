import { DragonPersonalityType, DragonTemplate } from '../config/dragonTypes';
import { GridPosition } from '../utils/GridPosition';

export interface DragonState {
  id: string;
  name: string;
  personality: DragonPersonalityType;
  combatPower: number;
  maxCombatPower: number;
  attackDamage: number;
  color: number;
  isAlive: boolean;
  /** 当前在场的回合数 */
  turnCounter: number;
  /** 贪食龙：饱腹度 0-100 */
  satiation: number;
  /** 破坏龙：已造成的伤害 */
  damageDealt: number;
  /** 破坏龙离开所需伤害阈值 */
  damageThreshold: number;
  /** 高傲龙：预告的攻击目标 */
  announcedTargets: GridPosition[] | null;
}

let dragonInstanceId = 0;

export function createDragon(template: DragonTemplate, year: number): DragonState {
  dragonInstanceId++;
  const powerScale = 1 + (year - 1) * 0.15;
  return {
    id: `${template.id}_${dragonInstanceId}`,
    name: template.name,
    personality: template.personality,
    combatPower: Math.round(template.baseCombatPower * powerScale),
    maxCombatPower: Math.round(template.baseCombatPower * powerScale),
    attackDamage: Math.round(template.baseAttack * powerScale),
    color: template.color,
    isAlive: true,
    turnCounter: 0,
    satiation: 0,
    damageDealt: 0,
    damageThreshold: Math.round(template.baseCombatPower * powerScale * 0.4),
    announcedTargets: null,
  };
}

export function dragonTakeDamage(dragon: DragonState, amount: number): void {
  dragon.combatPower = Math.max(0, dragon.combatPower - amount);
  if (dragon.combatPower <= 0) {
    dragon.isAlive = false;
  }
}

export function dragonIsDead(dragon: DragonState): boolean {
  return !dragon.isAlive || dragon.combatPower <= 0;
}

export function dragonShouldLeave(dragon: DragonState, phase: string): boolean {
  if (dragonIsDead(dragon)) return true;
  // 决战期龙不会主动离开
  if (phase === 'decisive_battle') return false;

  switch (dragon.personality) {
    case DragonPersonalityType.GLUTTONOUS:
      return dragon.satiation >= 80;
    case DragonPersonalityType.DESTRUCTIVE:
      return dragon.damageDealt >= dragon.damageThreshold;
    case DragonPersonalityType.ARROGANT:
    default:
      return false;
  }
}
