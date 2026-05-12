import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { randInt } from '../utils/random';

export interface BlockData {
  id: number;
  type: BlockType;
  value: number;
  power: number;
  shielded: boolean;
  attribute: string | null;
  targetColor?: number;
  targetDragonId?: string;
  /** 巨弩冷却 */
  cooldown: number;
  /** 无法攻击标签 */
  cannotAttack: boolean;
}

let nextBlockId = 1;

export function createBlock(type: BlockType, power?: number, value?: number): BlockData {
  const def = BLOCK_TYPE_TABLE[type];
  const p = power ?? def.defaultPower;
  return {
    id: nextBlockId++,
    type, value: value ?? p, power: p,
    shielded: false, attribute: null, cooldown: 0, cannotAttack: false,
  };
}

export function createPowerStone(villageLevel: number): BlockData {
  const minP = Math.max(1, villageLevel - 3);
  const maxP = villageLevel + 3;
  const p = randInt(minP, maxP);
  return { id: nextBlockId++, type: BlockType.POWER_STONE, value: p, power: p, shielded: false, attribute: null, cooldown: 0, cannotAttack: false };
}

/** 随机生成骑士/法师/巫毒之一 */
export function createRandomBlock(): BlockData {
  const types = [BlockType.KNIGHT, BlockType.MAGE, BlockType.VOODOO];
  const type = types[Math.floor(Math.random() * types.length)];
  return createBlock(type);
}
