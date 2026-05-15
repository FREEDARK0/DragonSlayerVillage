import { GENERATED_DRAGON_DATA } from './generatedData';

export enum DragonPersonalityType {
  ARROGANT = 'arrogant',
  GLUTTONOUS = 'gluttonous',
  DESTRUCTIVE = 'destructive',
  GOLD = 'gold',
  BRUTAL = 'brutal',
  WYVERN = 'wyvern',
}

export interface DragonTemplate {
  id: string;
  name: string;
  personality: DragonPersonalityType;
  hp: number;
  attack: number;
  breathRange: number;
  color: number;
  unlockTurn: number;
  spawnWeight: number;
  quantity: number;
  description: string;
  growth: DragonGrowthStats[];
}

export interface DragonGrowthStats {
  round: number;
  hp: number;
  attack: number;
}

export const DRAGON_TEMPLATES: DragonTemplate[] = GENERATED_DRAGON_DATA.map(row => {
  const growth = row.growth.map(entry => ({ round: entry.round, hp: entry.hp, attack: entry.attack }));
  const first = growth[0];
  return {
    id: row.id,
    name: row.name,
    personality: row.personality as DragonPersonalityType,
    hp: first.hp,
    attack: first.attack,
    breathRange: row.breathRange,
    color: row.color,
    unlockTurn: row.unlockTurn,
    spawnWeight: row.spawnWeight,
    quantity: row.quantity,
    description: row.description,
    growth,
  };
});

export function getAvailableDragons(turnNumber: number): DragonTemplate[] {
  return DRAGON_TEMPLATES.filter(d => d.unlockTurn <= turnNumber);
}

export function getDragonStatsForRound(template: DragonTemplate, round: number): DragonGrowthStats {
  const normalizedRound = Math.max(1, Math.floor(round));
  const defined = template.growth.find(entry => entry.round === normalizedRound);
  if (defined) return { ...defined };

  let stats = template.growth[template.growth.length - 1];
  for (let current = stats.round + 1; current <= normalizedRound; current++) {
    stats = {
      round: current,
      attack: Math.round(stats.attack * 1.5),
      hp: Math.round(stats.hp * 1.5),
    };
  }
  return { ...stats };
}

export function getDragonTemplateForRound(template: DragonTemplate, round: number): DragonTemplate {
  const stats = getDragonStatsForRound(template, round);
  return {
    ...template,
    hp: stats.hp,
    attack: stats.attack,
  };
}
