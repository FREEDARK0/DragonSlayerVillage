import { DragonPersonalityType, DragonTemplate } from '../config/dragonTypes';

export interface DragonState {
  id: string;
  templateId: string;
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
  hasTakenDamage: boolean;
  attackCount: number;
  respawnAvailableTurn: number | null;
  /** 龙所在的边 (0-7) */
  edgeIndex: number;
}

let dragonInstanceId = 0;

function scaledCombatPower(template: DragonTemplate, year: number): number {
  const powerScale = 1 + (year - 1) * 0.15;
  return Math.round(template.baseCombatPower * powerScale);
}

export function createDragon(template: DragonTemplate, year: number, edgeIndex: number): DragonState {
  dragonInstanceId++;
  const dragon: DragonState = {
    id: `${template.id}_${dragonInstanceId}`,
    templateId: template.id,
    name: template.name,
    personality: template.personality,
    combatPower: 0,
    maxCombatPower: 0,
    attackMultiplier: 0.3,
    color: template.color,
    isAlive: true,
    turnCounter: 0,
    satiation: 0,
    damageDealt: 0,
    damageThreshold: 0,
    announcedTargets: null,
    hasTakenDamage: false,
    attackCount: 0,
    respawnAvailableTurn: null,
    edgeIndex,
  };
  resetDragonForSpawn(dragon, template, year, edgeIndex);
  return dragon;
}

export function resetDragonForSpawn(dragon: DragonState, template: DragonTemplate, year: number, edgeIndex: number): void {
  const combatPower = scaledCombatPower(template, year);
  dragon.templateId = template.id;
  dragon.name = template.name;
  dragon.personality = template.personality;
  dragon.combatPower = combatPower;
  dragon.maxCombatPower = combatPower;
  dragon.attackMultiplier = 0.3;
  dragon.color = template.color;
  dragon.isAlive = true;
  dragon.turnCounter = 0;
  dragon.satiation = 0;
  dragon.damageDealt = 0;
  dragon.damageThreshold = Math.round(combatPower * 0.4);
  dragon.announcedTargets = null;
  dragon.hasTakenDamage = false;
  dragon.attackCount = 0;
  dragon.respawnAvailableTurn = null;
  dragon.edgeIndex = edgeIndex;
}

export function markDragonDefeated(dragon: DragonState, respawnAvailableTurn: number): void {
  dragon.combatPower = 0;
  dragon.isAlive = false;
  dragon.announcedTargets = null;
  dragon.respawnAvailableTurn = respawnAvailableTurn;
}

export function markDragonDeparted(dragon: DragonState): void {
  dragon.isAlive = false;
  dragon.announcedTargets = null;
  dragon.respawnAvailableTurn = null;
}

export function dragonTakeDamage(dragon: DragonState, amount: number): void {
  if (amount > 0) dragon.hasTakenDamage = true;
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
