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
}

export const DRAGON_TEMPLATES: DragonTemplate[] = [
  { id: 'wyvern', name: '亚龙', personality: DragonPersonalityType.WYVERN, hp: 15, attack: 5, breathRange: 1, color: 0x66aa66, unlockTurn: 1, spawnWeight: 4, quantity: 3 },
  { id: 'aurus', name: '奥鲁斯', personality: DragonPersonalityType.GOLD, hp: 30, attack: 7, breathRange: 1, color: 0xffcc00, unlockTurn: 2, spawnWeight: 3, quantity: 2 },
  { id: 'furo', name: '弗罗', personality: DragonPersonalityType.DESTRUCTIVE, hp: 30, attack: 10, breathRange: 3, color: 0x8844cc, unlockTurn: 4, spawnWeight: 2, quantity: 1 },
  { id: 'ignis', name: '伊格尼斯', personality: DragonPersonalityType.ARROGANT, hp: 40, attack: 5, breathRange: 3, color: 0xff4444, unlockTurn: 6, spawnWeight: 2, quantity: 1 },
  { id: 'gulo', name: '古洛', personality: DragonPersonalityType.GLUTTONOUS, hp: 30, attack: 5, breathRange: 3, color: 0xff8844, unlockTurn: 10, spawnWeight: 2, quantity: 1 },
  { id: 'brutus', name: '布鲁图斯', personality: DragonPersonalityType.BRUTAL, hp: 50, attack: 10, breathRange: 1, color: 0xcc2222, unlockTurn: 10, spawnWeight: 2, quantity: 1 },
];

export function getAvailableDragons(turnNumber: number): DragonTemplate[] {
  return DRAGON_TEMPLATES.filter(d => d.unlockTurn <= turnNumber);
}
