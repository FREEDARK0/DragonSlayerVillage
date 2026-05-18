import { BlockTag, BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { randInt } from '../utils/random';

export interface BlockData {
  id: number;
  type: BlockType;
  hp: number;
  attack: number;
  tags: BlockTag[];
  shielded: boolean;
  targetColor?: number;
  targetDragonId?: string;
  cooldown: number;
  tempAttack: number;
  tempHp: number;
  turnAttackBonus: number;
  /** 风箱方向 1=CW, -1=CCW */
  direction?: number;
}

let nextBlockId = 1;

export function resetBlockIdCounter(nextId: number = 1): void {
  nextBlockId = nextId;
}

export function createBlock(type: BlockType, hp?: number, attack?: number): BlockData {
  const def = BLOCK_TYPE_TABLE[type];
  return {
    id: nextBlockId++,
    type,
    hp: hp ?? def.hp,
    attack: attack ?? def.attack,
    tags: [],
    shielded: false,
    cooldown: 0,
    tempAttack: 0,
    tempHp: 0,
    turnAttackBonus: 0,
  };
}

export function createPowerStone(hp: number = randInt(1, 20)): BlockData {
  return createBlock(BlockType.POWER_STONE, hp, 0);
}

export function createDragonFire(hp: number = 10): BlockData {
  return createBlock(BlockType.DRAGON_FIRE, hp, 0);
}

export function createVoodooDoll(target: { id: string; color: number }): BlockData {
  const block = createBlock(BlockType.VOODOO, 20, 0);
  block.targetDragonId = target.id;
  block.targetColor = target.color;
  return block;
}
