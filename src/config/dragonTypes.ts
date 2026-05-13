export enum DragonPersonalityType {
  ARROGANT = 'arrogant',
  GLUTTONOUS = 'gluttonous',
  DESTRUCTIVE = 'destructive',
  GOLD = 'gold',
  BRUTAL = 'brutal',
  WYVERN = 'wyvern',
  SUN = 'sun',
  DARK = 'dark',
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
  quantity: number;
}

export const DRAGON_TEMPLATES: DragonTemplate[] = [
  { id: 'ignis', name: '伊格尼斯', personality: DragonPersonalityType.ARROGANT, baseCombatPower: 20, baseAttack: 3, color: 0xff4444, minYear: 1, spawnWeight: 3, quantity: 1 },
  { id: 'gulo', name: '古洛', personality: DragonPersonalityType.GLUTTONOUS, baseCombatPower: 20, baseAttack: 3, color: 0xff8844, minYear: 1, spawnWeight: 4, quantity: 1 },
  { id: 'furo', name: '弗罗', personality: DragonPersonalityType.DESTRUCTIVE, baseCombatPower: 25, baseAttack: 4, color: 0x8844cc, minYear: 1, spawnWeight: 2, quantity: 1 },
  { id: 'aurus', name: '奥鲁斯', personality: DragonPersonalityType.GOLD, baseCombatPower: 18, baseAttack: 2, color: 0xffcc00, minYear: 1, spawnWeight: 3, quantity: 2 },
  { id: 'wyvern', name: '亚龙', personality: DragonPersonalityType.WYVERN, baseCombatPower: 15, baseAttack: 2, color: 0x66aa66, minYear: 1, spawnWeight: 3, quantity: 3 },
  { id: 'brutus', name: '布鲁图斯', personality: DragonPersonalityType.BRUTAL, baseCombatPower: 30, baseAttack: 5, color: 0xcc2222, minYear: 1, spawnWeight: 2, quantity: 1 },
  { id: 'sol', name: '索尔', personality: DragonPersonalityType.SUN, baseCombatPower: 22, baseAttack: 3, color: 0xffff88, minYear: 99, spawnWeight: 1, quantity: 1 },
  { id: 'nox', name: '诺克斯', personality: DragonPersonalityType.DARK, baseCombatPower: 28, baseAttack: 4, color: 0x332255, minYear: 99, spawnWeight: 1, quantity: 1 },
];

export function getAvailableDragons(year: number): DragonTemplate[] {
  return DRAGON_TEMPLATES.filter(d => d.minYear <= year);
}
