import { BlockTag, BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { randInt } from '../utils/random';

export interface BlockData {
  id: number;
  type: BlockType;
  level: number;
  combatPower: number;
  generatedCombatPower?: number;
  tags: BlockTag[];
  shielded: boolean;
  targetColor?: number;
  targetDragonId?: string;
  /** 巨弩冷却 */
  cooldown: number;
  /** 风箱方向 1=CW, -1=CCW */
  direction?: number;
  /** 铁匠铺相邻放置/升级加成，触发后成长 */
  smithyPlacementBonus?: number;
}

let nextBlockId = 1;

export function createBlock(type: BlockType, combatPower?: number, level: number = 1): BlockData {
  const def = BLOCK_TYPE_TABLE[type];
  const cp = combatPower ?? def.defaultPower;
  return {
    id: nextBlockId++,
    type, level, combatPower: cp, tags: [...(def.tags ?? [])],
    shielded: false, cooldown: 0,
  };
}

export function createPowerStone(level: number = 1, combatPower: number = randInt(1, 20)): BlockData {
  const block = createBlock(BlockType.POWER_STONE, combatPower, level);
  block.generatedCombatPower = combatPower;
  return block;
}

/** 随机生成骑士/法师/巫毒之一 */
export function createRandomBlock(): BlockData {
  const types = [BlockType.KNIGHT, BlockType.MAGE, BlockType.VOODOO];
  const type = types[Math.floor(Math.random() * types.length)];
  return createBlock(type);
}
