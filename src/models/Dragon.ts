import { DragonPersonalityType, DragonTemplate } from '../config/dragonTypes';

export interface DragonState {
  id: string;
  name: string;
  personality: DragonPersonalityType;
  combatPower: number;
  maxCombatPower: number;
  attackMultiplier: number;
  color: number;
  isAlive: boolean;
  turnCounter: number;
  satiation: number;
  damageDealt: number;
  damageThreshold: number;
  announcedTargets: number[] | null;
  /** 龙所在的边 (0-7) */
  edgeIndex: number;
  /** 龙属性元素 */
  element: string;
}

let dragonInstanceId = 0;

export function createDragon(template: DragonTemplate, year: number, edgeIndex: number): DragonState {
  dragonInstanceId++;
  const powerScale = 1 + (year - 1) * 0.15;
  return {
    id: `${template.id}_${dragonInstanceId}`,
    name: template.name,
    personality: template.personality,
    combatPower: Math.round(template.baseCombatPower * powerScale),
    maxCombatPower: Math.round(template.baseCombatPower * powerScale),
    attackMultiplier: 0.3,
    color: template.color,
    isAlive: true,
    turnCounter: 0,
    satiation: 0,
    damageDealt: 0,
    damageThreshold: Math.round(template.baseCombatPower * powerScale * 0.4),
    announcedTargets: null,
    edgeIndex,
    element: template.element,
  };
}

export function dragonTakeDamage(dragon: DragonState, amount: number): void {
  dragon.combatPower = Math.max(0, dragon.combatPower - amount);
  if (dragon.combatPower <= 0) dragon.isAlive = false;
}

export function dragonIsDead(dragon: DragonState): boolean {
  return !dragon.isAlive || dragon.combatPower <= 0;
}

export function dragonShouldLeave(dragon: DragonState, phase: string): boolean {
  if (dragonIsDead(dragon)) return true;
  return false; // no longer auto-leave by personality
}
