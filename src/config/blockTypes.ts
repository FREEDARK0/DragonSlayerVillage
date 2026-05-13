export enum BlockType {
  KNIGHT = 'knight',
  MAGE = 'mage',
  VOODOO = 'voodoo',
  POWER_STONE = 'power_stone',
  WEAKNESS = 'weakness',
  DRAGON_FIRE = 'dragon_fire',
  WOOD_WALL = 'wood_wall',
  BALLISTA = 'ballista',
  PRESSURE_STONE = 'pressure_stone',
  MINE = 'mine',
  PRIEST = 'priest',
  PORTAL = 'portal',
  SPIKES = 'spikes',
  TAVERN = 'tavern',
  ASSASSIN = 'assassin',
  BELLOWS = 'bellows',
  SENSING_WALL = 'sensing_wall',
}

export enum BlockTag {
  UNABLE_TO_ATTACK = 'unable_to_attack',
}

export enum SpellType {
  FOCUS_FIELD = 'focus_field',
  SACRIFICE = 'sacrifice',
  BULWARK = 'bulwark',
  SHIELD_CRUSH = 'shield_crush',
}

export interface BlockTypeDef {
  type: BlockType;
  label: string;
  color: number;
  defaultPower: number;
  tags?: BlockTag[];
}

export const BLOCK_TYPE_TABLE: Record<BlockType, BlockTypeDef> = {
  [BlockType.KNIGHT]: { type: BlockType.KNIGHT, label: '骑士', color: 0x4488ff, defaultPower: 5 },
  [BlockType.MAGE]: { type: BlockType.MAGE, label: '法师', color: 0xaa44ff, defaultPower: 8 },
  [BlockType.VOODOO]: { type: BlockType.VOODOO, label: '巫毒娃娃', color: 0x888888, defaultPower: 10, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.POWER_STONE]: { type: BlockType.POWER_STONE, label: '金矿', color: 0xffaa00, defaultPower: 5 },
  [BlockType.WEAKNESS]: { type: BlockType.WEAKNESS, label: '弱点', color: 0xff3333, defaultPower: 0 },
  [BlockType.DRAGON_FIRE]: { type: BlockType.DRAGON_FIRE, label: '龙焰', color: 0xff5522, defaultPower: 10 },
  [BlockType.WOOD_WALL]: { type: BlockType.WOOD_WALL, label: '木墙', color: 0x8B6914, defaultPower: 10, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.BALLISTA]: { type: BlockType.BALLISTA, label: '巨弩', color: 0x888888, defaultPower: 5 },
  [BlockType.PRESSURE_STONE]: { type: BlockType.PRESSURE_STONE, label: '压力石', color: 0x6644aa, defaultPower: 0, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.MINE]: { type: BlockType.MINE, label: '矿厂', color: 0x888855, defaultPower: 10, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.PRIEST]: { type: BlockType.PRIEST, label: '祭司', color: 0xffddaa, defaultPower: 5, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.PORTAL]: { type: BlockType.PORTAL, label: '通道', color: 0x8844cc, defaultPower: 7, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.SPIKES]: { type: BlockType.SPIKES, label: '地刺', color: 0xaaaaaa, defaultPower: 10 },
  [BlockType.TAVERN]: { type: BlockType.TAVERN, label: '酒馆', color: 0xcc8844, defaultPower: 10, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.ASSASSIN]: { type: BlockType.ASSASSIN, label: '刺客', color: 0x333333, defaultPower: 9 },
  [BlockType.BELLOWS]: { type: BlockType.BELLOWS, label: '风箱', color: 0x7799aa, defaultPower: 5, tags: [BlockTag.UNABLE_TO_ATTACK] },
  [BlockType.SENSING_WALL]: { type: BlockType.SENSING_WALL, label: '感应石墙', color: 0x4aa6aa, defaultPower: 20, tags: [BlockTag.UNABLE_TO_ATTACK] },
};

/** 道具注册表（商店可用） */
export interface BaseShopItem {
  id: string;
  kind: 'block' | 'spell';
  label: string;
  cost: number;
  tags: string[];
}

export interface BlockShopItem extends BaseShopItem {
  kind: 'block';
  blockType: BlockType;
  combatPower: number;
}

export interface SpellShopItem extends BaseShopItem {
  kind: 'spell';
  spellType: SpellType;
}

export type ShopItem = BlockShopItem | SpellShopItem;

export const SHOP_ITEM_POOL: ShopItem[] = [
  blockItem(BlockType.WOOD_WALL, 5, 10),
  blockItem(BlockType.BALLISTA, 60, 5),
  blockItem(BlockType.PRESSURE_STONE, 80, 0),
  blockItem(BlockType.MINE, 10, 10),
  blockItem(BlockType.PRIEST, 80, 5),
  blockItem(BlockType.PORTAL, 80, 7),
  blockItem(BlockType.SPIKES, 60, 10),
  blockItem(BlockType.TAVERN, 80, 10),
  blockItem(BlockType.ASSASSIN, 70, 9),
  blockItem(BlockType.BELLOWS, 50, 5),
  blockItem(BlockType.SENSING_WALL, 80, 20),
  spellItem(SpellType.FOCUS_FIELD, '集中力场', 40),
  spellItem(SpellType.SACRIFICE, '献祭', 15),
  spellItem(SpellType.BULWARK, '壁垒', 30),
  spellItem(SpellType.SHIELD_CRUSH, '盾牌碾压', 50),
];

function blockItem(blockType: BlockType, cost: number, combatPower: number): BlockShopItem {
  const def = BLOCK_TYPE_TABLE[blockType];
  const tags = (def.tags ?? []).map(blockTagLabel);
  return { id: `block:${blockType}`, kind: 'block', label: def.label, cost, tags, blockType, combatPower };
}

function spellItem(spellType: SpellType, label: string, cost: number): SpellShopItem {
  return { id: `spell:${spellType}`, kind: 'spell', label, cost, tags: ['法术'], spellType };
}

export function blockTagLabel(tag: BlockTag): string {
  if (tag === BlockTag.UNABLE_TO_ATTACK) return '无法攻击';
  return tag;
}

/** 村庄升级阈值 */
export function getVillageLevel(power: number): number {
  let level = 0;
  for (const threshold of [60, 80, 120, 200]) {
    if (power >= threshold) level++;
    else break;
  }
  return level;
}
