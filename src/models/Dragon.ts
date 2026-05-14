import { DragonPersonalityType, DragonTemplate } from '../config/dragonTypes';

export interface DragonState {
  id: string;
  templateId: string;
  name: string;
  personality: DragonPersonalityType;
  hp: number;
  maxHp: number;
  attack: number;
  breathRange: number;
  color: number;
  isAlive: boolean;
  turnCounter: number;
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

export function createDragon(template: DragonTemplate, edgeIndex: number): DragonState {
  dragonInstanceId++;
  const dragon: DragonState = {
    id: `${template.id}_${dragonInstanceId}`,
    templateId: template.id,
    name: template.name,
    personality: template.personality,
    hp: 0,
    maxHp: 0,
    attack: 0,
    breathRange: 1,
    color: template.color,
    isAlive: true,
    turnCounter: 0,
    damageDealt: 0,
    damageThreshold: 0,
    announcedTargets: null,
    hasTakenDamage: false,
    attackCount: 0,
    respawnAvailableTurn: null,
    edgeIndex,
  };
  resetDragonForSpawn(dragon, template, edgeIndex);
  return dragon;
}

export function resetDragonForSpawn(dragon: DragonState, template: DragonTemplate, edgeIndex: number): void {
  dragon.templateId = template.id;
  dragon.name = template.name;
  dragon.personality = template.personality;
  dragon.hp = template.hp;
  dragon.maxHp = template.hp;
  dragon.attack = template.attack;
  dragon.breathRange = template.breathRange;
  dragon.color = template.color;
  dragon.isAlive = true;
  dragon.turnCounter = 0;
  dragon.damageDealt = 0;
  dragon.damageThreshold = Math.round(template.hp * 0.4);
  dragon.announcedTargets = null;
  dragon.hasTakenDamage = false;
  dragon.attackCount = 0;
  dragon.respawnAvailableTurn = null;
  dragon.edgeIndex = edgeIndex;
}

export function markDragonDefeated(dragon: DragonState, respawnAvailableTurn: number): void {
  dragon.hp = 0;
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
  if (amount <= 0 || !dragon.isAlive) return;
  dragon.hasTakenDamage = true;
  dragon.hp = Math.max(0, dragon.hp - amount);
  if (dragon.hp <= 0) dragon.isAlive = false;
}

export function dragonIsDead(dragon: DragonState): boolean {
  return !dragon.isAlive || dragon.hp <= 0;
}
