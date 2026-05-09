export enum DragonPersonalityType {
  ARROGANT = 'arrogant',
  GLUTTONOUS = 'gluttonous',
  DESTRUCTIVE = 'destructive',
}

export interface DragonTemplate {
  id: string;
  name: string;
  personality: DragonPersonalityType;
  baseCombatPower: number;
  baseAttack: number;
  color: number;
  minYear: number;
  spawnWeight: number;
}

export const DRAGON_TEMPLATES: DragonTemplate[] = [
  {
    id: 'ignis',
    name: '伊格尼斯',
    personality: DragonPersonalityType.ARROGANT,
    baseCombatPower: 20,
    baseAttack: 3,
    color: 0xff4444,
    minYear: 1,
    spawnWeight: 3,
  },
  {
    id: 'gulo',
    name: '古洛',
    personality: DragonPersonalityType.GLUTTONOUS,
    baseCombatPower: 15,
    baseAttack: 2,
    color: 0xff8844,
    minYear: 1,
    spawnWeight: 4,
  },
  {
    id: 'furo',
    name: '弗罗',
    personality: DragonPersonalityType.DESTRUCTIVE,
    baseCombatPower: 25,
    baseAttack: 4,
    color: 0x8844cc,
    minYear: 2,
    spawnWeight: 2,
  },
  {
    id: 'glacius',
    name: '格拉修斯',
    personality: DragonPersonalityType.ARROGANT,
    baseCombatPower: 22,
    baseAttack: 3,
    color: 0x44ccff,
    minYear: 2,
    spawnWeight: 2,
  },
  {
    id: 'munch',
    name: '曼奇',
    personality: DragonPersonalityType.GLUTTONOUS,
    baseCombatPower: 18,
    baseAttack: 3,
    color: 0xccff44,
    minYear: 1,
    spawnWeight: 3,
  },
];

export function getAvailableDragons(year: number): DragonTemplate[] {
  return DRAGON_TEMPLATES.filter(d => d.minYear <= year);
}
