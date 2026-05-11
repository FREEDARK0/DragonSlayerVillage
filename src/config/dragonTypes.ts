export enum DragonPersonalityType {
  ARROGANT = 'arrogant',
  GLUTTONOUS = 'gluttonous',
  DESTRUCTIVE = 'destructive',
  GOLD = 'gold',
  BRUTAL = 'brutal',
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
  element: string;
  minYear: number;
  spawnWeight: number;
}

/** 属性→颜色映射 */
export const ELEMENT_COLORS: Record<string, number> = {
  gold: 0xffcc00,
  strength: 0xff4444,
  life: 0x44cc44,
  light: 0xffeecc,
  dark: 0x442288,
};

export const DRAGON_TEMPLATES: DragonTemplate[] = [
  { id: 'ignis', name: '伊格尼斯', personality: DragonPersonalityType.ARROGANT, baseCombatPower: 20, baseAttack: 3, color: 0xff4444, element: 'strength', minYear: 1, spawnWeight: 3 },
  { id: 'gulo', name: '古洛', personality: DragonPersonalityType.GLUTTONOUS, baseCombatPower: 15, baseAttack: 2, color: 0xff8844, element: 'life', minYear: 1, spawnWeight: 4 },
  { id: 'furo', name: '弗罗', personality: DragonPersonalityType.DESTRUCTIVE, baseCombatPower: 25, baseAttack: 4, color: 0x8844cc, element: 'dark', minYear: 1, spawnWeight: 2 },
  { id: 'aurus', name: '奥鲁斯', personality: DragonPersonalityType.GOLD, baseCombatPower: 18, baseAttack: 2, color: 0xffcc00, element: 'gold', minYear: 1, spawnWeight: 3 },
  { id: 'brutus', name: '布鲁图斯', personality: DragonPersonalityType.BRUTAL, baseCombatPower: 30, baseAttack: 5, color: 0xcc2222, element: 'strength', minYear: 1, spawnWeight: 2 },
  { id: 'sol', name: '索尔', personality: DragonPersonalityType.SUN, baseCombatPower: 22, baseAttack: 3, color: 0xffff88, element: 'light', minYear: 99, spawnWeight: 1 },
  { id: 'nox', name: '诺克斯', personality: DragonPersonalityType.DARK, baseCombatPower: 28, baseAttack: 4, color: 0x332255, element: 'dark', minYear: 99, spawnWeight: 1 },
];

export function getAvailableDragons(year: number): DragonTemplate[] {
  return DRAGON_TEMPLATES.filter(d => d.minYear <= year);
}
