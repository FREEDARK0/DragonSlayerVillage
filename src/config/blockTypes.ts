export enum BlockType {
  VILLAGE = 'village',
  KNIGHT = 'knight',
  MAGE = 'mage',
  VOODOO = 'voodoo',
  POWER_STONE = 'power_stone',
  WEAKNESS = 'weakness',
  WOOD_WALL = 'wood_wall',
}

export interface BlockTypeDef {
  type: BlockType;
  label: string;
  color: number;
  defaultPower: number;
}

export const BLOCK_TYPE_TABLE: Record<BlockType, BlockTypeDef> = {
  [BlockType.VILLAGE]: { type: BlockType.VILLAGE, label: '村庄', color: 0x66bb44, defaultPower: 50 },
  [BlockType.KNIGHT]: { type: BlockType.KNIGHT, label: '骑士', color: 0x4488ff, defaultPower: 5 },
  [BlockType.MAGE]: { type: BlockType.MAGE, label: '法师', color: 0xaa44ff, defaultPower: 8 },
  [BlockType.VOODOO]: { type: BlockType.VOODOO, label: '巫毒娃娃', color: 0x888888, defaultPower: 10 },
  [BlockType.POWER_STONE]: { type: BlockType.POWER_STONE, label: '战力石', color: 0xffaa00, defaultPower: 5 },
  [BlockType.WEAKNESS]: { type: BlockType.WEAKNESS, label: '弱点', color: 0xff3333, defaultPower: 0 },
  [BlockType.WOOD_WALL]: { type: BlockType.WOOD_WALL, label: '木墙', color: 0x8B6914, defaultPower: 10 },
};

/** 村庄升级阈值 */
export const VILLAGE_LEVELS = [60, 80, 120, 200];

export function getVillageLevel(power: number): number {
  let level = 0;
  for (const threshold of VILLAGE_LEVELS) {
    if (power >= threshold) level++;
    else break;
  }
  return level;
}
