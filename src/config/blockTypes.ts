export enum BlockType {
  VILLAGE = 'village',
  FOOD = 'food',
  SWORD = 'sword',
  TRAINING = 'training',
  IMP = 'imp',
  WALL = 'wall',
  EVIL_EYE = 'evil_eye',
  EMPTY = 'empty',
}

export interface BlockTypeDef {
  type: BlockType;
  label: string;
  color: number;
  spawnWeight: number;
  providesEffect: boolean;
  effectValue: number;
  defaultHP: number;
}

export const BLOCK_TYPE_TABLE: Record<BlockType, BlockTypeDef> = {
  [BlockType.VILLAGE]: {
    type: BlockType.VILLAGE, label: '村庄', color: 0x66bb44,
    spawnWeight: 2, providesEffect: true, effectValue: 1, defaultHP: 5,
  },
  [BlockType.FOOD]: {
    type: BlockType.FOOD, label: '食物', color: 0xff8844,
    spawnWeight: 3, providesEffect: true, effectValue: 1, defaultHP: 1,
  },
  [BlockType.SWORD]: {
    type: BlockType.SWORD, label: '剑', color: 0xcccccc,
    spawnWeight: 2, providesEffect: true, effectValue: 0, defaultHP: 1,
  },
  [BlockType.TRAINING]: {
    type: BlockType.TRAINING, label: '训练', color: 0xff6644,
    spawnWeight: 2, providesEffect: true, effectValue: 2, defaultHP: 1,
  },
  [BlockType.IMP]: {
    type: BlockType.IMP, label: '小鬼', color: 0xcc4444,
    spawnWeight: 0, providesEffect: false, effectValue: 0, defaultHP: 3,
  },
  [BlockType.WALL]: {
    type: BlockType.WALL, label: '墙', color: 0x886644,
    spawnWeight: 1, providesEffect: false, effectValue: 0, defaultHP: 8,
  },
  [BlockType.EVIL_EYE]: {
    type: BlockType.EVIL_EYE, label: '魔眼', color: 0xaa44ff,
    spawnWeight: 1, providesEffect: false, effectValue: 0, defaultHP: 4,
  },
  [BlockType.EMPTY]: {
    type: BlockType.EMPTY, label: '空', color: 0x222233,
    spawnWeight: 0, providesEffect: false, effectValue: 0, defaultHP: 0,
  },
};

/**
 * 获取可以在地图上随机生成的方块类型
 */
export function getSpawnableBlockTypes(): BlockTypeDef[] {
  return Object.values(BLOCK_TYPE_TABLE).filter(b => b.spawnWeight > 0);
}

/**
 * 给定已损坏方块的类型，确定补充方块的候选池
 */
export function getReplenishCandidateTypes(): BlockTypeDef[] {
  return Object.values(BLOCK_TYPE_TABLE).filter(b => b.spawnWeight > 0);
}
