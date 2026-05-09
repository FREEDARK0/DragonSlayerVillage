import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { Direction, randomDirection } from '../utils/Direction';
import { randInt } from '../utils/random';

export interface BlockData {
  id: number;
  type: BlockType;
  value: number;
  direction: Direction | null;
  shielded: boolean;
  /** 剑方块对应的龙ID（用于攻击特定龙） */
  targetDragonId?: string;
  /** 剑方块的显示颜色（与目标龙匹配） */
  targetColor?: number;
}

let nextBlockId = 1;

export function createBlock(type: BlockType, value?: number, direction?: Direction | null): BlockData {
  const def = BLOCK_TYPE_TABLE[type];
  return {
    id: nextBlockId++,
    type,
    value: value ?? def.defaultHP,
    direction: direction ?? null,
    shielded: false,
  };
}

export function createRandomBlock(dragonIds?: string[], dragonColors?: number[]): BlockData {
  const spawnable = [BlockType.VILLAGE, BlockType.FOOD, BlockType.SWORD, BlockType.TRAINING, BlockType.WALL, BlockType.EVIL_EYE];
  const weights = spawnable.map(t => BLOCK_TYPE_TABLE[t].spawnWeight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < spawnable.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      const type = spawnable[i];
      const val = (type === BlockType.FOOD || type === BlockType.SWORD || type === BlockType.VILLAGE || type === BlockType.TRAINING)
        ? randInt(1, 3) : BLOCK_TYPE_TABLE[type].defaultHP;
      const block = createBlock(type, val);
      // 剑方块随机对应一条龙
      if (type === BlockType.SWORD && dragonIds && dragonIds.length > 0 && dragonColors) {
        const idx = Math.floor(Math.random() * dragonIds.length);
        block.targetDragonId = dragonIds[idx];
        block.targetColor = dragonColors[idx];
      }
      return block;
    }
  }
  return createBlock(BlockType.FOOD, randInt(1, 3));
}

export function createImpBlock(direction?: Direction): BlockData {
  return createBlock(BlockType.IMP, BLOCK_TYPE_TABLE[BlockType.IMP].defaultHP, direction ?? randomDirection());
}

export function isCharacterBlock(type: BlockType): boolean {
  return type === BlockType.IMP;
}
