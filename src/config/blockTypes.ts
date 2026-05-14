export enum BlockType {
  KNIGHT = 'knight',
  MAGE = 'mage',
  WIZARD = 'wizard',
  VOODOO = 'voodoo',
  INFANTRY = 'infantry',
  POWER_STONE = 'power_stone',
  WEAKNESS = 'weakness',
  DRAGON_FIRE = 'dragon_fire',
  WOOD_WALL = 'wood_wall',
  BALLISTA = 'ballista',
  PRESSURE_STONE = 'pressure_stone',
  MINE = 'mine',
  GUARDIAN = 'guardian',
  PORTAL = 'portal',
  SPIKES = 'spikes',
  TAVERN = 'tavern',
  SMITHY = 'smithy',
  ASSASSIN = 'assassin',
  BELLOWS = 'bellows',
  SENSING_WALL = 'sensing_wall',
  DRAGON_SPEAR = 'dragon_spear',
}

export enum BlockTag {
  SPELL = 'spell',
}

export enum SpellType {
  MISSILE = 'missile',
  FOCUS_DEFENSE = 'focus_defense',
  FOCUS_BREAKTHROUGH = 'focus_breakthrough',
  SACRIFICE = 'sacrifice',
  BULWARK = 'bulwark',
  SHIELD_CRUSH = 'shield_crush',
}

export interface BlockTypeDef {
  type: BlockType;
  label: string;
  color: number;
  hp: number;
  attack: number;
  purchasable: boolean;
}

export const BLOCK_TYPE_TABLE: Record<BlockType, BlockTypeDef> = {
  [BlockType.KNIGHT]: { type: BlockType.KNIGHT, label: '骑士', color: 0x4488ff, hp: 20, attack: 10, purchasable: true },
  [BlockType.MAGE]: { type: BlockType.MAGE, label: '法师', color: 0xaa44ff, hp: 8, attack: 1, purchasable: true },
  [BlockType.WIZARD]: { type: BlockType.WIZARD, label: '巫师', color: 0x6b4bc2, hp: 8, attack: 0, purchasable: true },
  [BlockType.VOODOO]: { type: BlockType.VOODOO, label: '巫毒娃娃', color: 0x888888, hp: 20, attack: 0, purchasable: false },
  [BlockType.INFANTRY]: { type: BlockType.INFANTRY, label: '步兵', color: 0x4f8c5a, hp: 10, attack: 5, purchasable: true },
  [BlockType.POWER_STONE]: { type: BlockType.POWER_STONE, label: '金矿', color: 0xffaa00, hp: 5, attack: 0, purchasable: false },
  [BlockType.WEAKNESS]: { type: BlockType.WEAKNESS, label: '弱点', color: 0xff3333, hp: 0, attack: 0, purchasable: false },
  [BlockType.DRAGON_FIRE]: { type: BlockType.DRAGON_FIRE, label: '龙焰', color: 0xff5522, hp: 10, attack: 0, purchasable: false },
  [BlockType.WOOD_WALL]: { type: BlockType.WOOD_WALL, label: '木墙', color: 0x8b6914, hp: 8, attack: 0, purchasable: true },
  [BlockType.BALLISTA]: { type: BlockType.BALLISTA, label: '巨弩', color: 0x888888, hp: 8, attack: 5, purchasable: true },
  [BlockType.PRESSURE_STONE]: { type: BlockType.PRESSURE_STONE, label: '压力石', color: 0x6644aa, hp: 0, attack: 0, purchasable: true },
  [BlockType.MINE]: { type: BlockType.MINE, label: '矿场', color: 0x888855, hp: 8, attack: 0, purchasable: true },
  [BlockType.GUARDIAN]: { type: BlockType.GUARDIAN, label: '卫士', color: 0xffddaa, hp: 10, attack: 0, purchasable: true },
  [BlockType.PORTAL]: { type: BlockType.PORTAL, label: '通道', color: 0x8844cc, hp: 30, attack: 0, purchasable: true },
  [BlockType.SPIKES]: { type: BlockType.SPIKES, label: '地刺', color: 0xaaaaaa, hp: 15, attack: 2, purchasable: true },
  [BlockType.TAVERN]: { type: BlockType.TAVERN, label: '酒馆', color: 0xcc8844, hp: 10, attack: 0, purchasable: true },
  [BlockType.SMITHY]: { type: BlockType.SMITHY, label: '铁匠铺', color: 0xa86832, hp: 10, attack: 1, purchasable: true },
  [BlockType.ASSASSIN]: { type: BlockType.ASSASSIN, label: '刺客', color: 0x333333, hp: 8, attack: 0, purchasable: true },
  [BlockType.BELLOWS]: { type: BlockType.BELLOWS, label: '风箱', color: 0x7799aa, hp: 10, attack: 0, purchasable: true },
  [BlockType.SENSING_WALL]: { type: BlockType.SENSING_WALL, label: '感应石墙', color: 0x4aa6aa, hp: 40, attack: 0, purchasable: true },
  [BlockType.DRAGON_SPEAR]: { type: BlockType.DRAGON_SPEAR, label: '龙枪', color: 0xb83c2e, hp: 15, attack: 5, purchasable: true },
};

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
  hp: number;
  attack: number;
}

export interface SpellShopItem extends BaseShopItem {
  kind: 'spell';
  spellType: SpellType;
}

export type ShopItem = BlockShopItem | SpellShopItem;

export const SHOP_TAG_BASE = '基础';
export const SHOP_TAG_RANDOM = '随机';
export const SHOP_TAG_SPELL = '法术';

export const BASE_SHOP_ITEM_IDS = new Set(['block:wood_wall', 'block:mine', 'spell:missile']);

export const SHOP_ITEM_POOL: ShopItem[] = [
  blockItem(BlockType.WOOD_WALL, 5),
  blockItem(BlockType.MINE, 15),
  spellItem(SpellType.MISSILE, '飞弹', 10),
  blockItem(BlockType.BALLISTA, 10),
  blockItem(BlockType.PRESSURE_STONE, 15),
  blockItem(BlockType.GUARDIAN, 20),
  blockItem(BlockType.PORTAL, 20),
  blockItem(BlockType.SPIKES, 10),
  blockItem(BlockType.TAVERN, 20),
  blockItem(BlockType.SMITHY, 25),
  blockItem(BlockType.ASSASSIN, 10),
  blockItem(BlockType.BELLOWS, 20),
  blockItem(BlockType.SENSING_WALL, 30),
  blockItem(BlockType.DRAGON_SPEAR, 30),
  blockItem(BlockType.KNIGHT, 25),
  blockItem(BlockType.MAGE, 40),
  blockItem(BlockType.WIZARD, 25),
  blockItem(BlockType.INFANTRY, 15),
  spellItem(SpellType.FOCUS_DEFENSE, '集中防御', 20),
  spellItem(SpellType.FOCUS_BREAKTHROUGH, '集中突破', 25),
  spellItem(SpellType.SACRIFICE, '献祭', 20),
  spellItem(SpellType.BULWARK, '壁垒', 15),
  spellItem(SpellType.SHIELD_CRUSH, '盾牌碾压', 25),
];

export const BASE_SHOP_ITEMS = SHOP_ITEM_POOL.filter(item => BASE_SHOP_ITEM_IDS.has(item.id));
export const RANDOM_SHOP_POOL = SHOP_ITEM_POOL.filter(item => !BASE_SHOP_ITEM_IDS.has(item.id));

function blockItem(blockType: BlockType, cost: number): BlockShopItem {
  const def = BLOCK_TYPE_TABLE[blockType];
  return {
    id: `block:${blockType}`,
    kind: 'block',
    label: def.label,
    cost,
    tags: [SHOP_TAG_RANDOM],
    blockType,
    hp: def.hp,
    attack: def.attack,
  };
}

function spellItem(spellType: SpellType, label: string, cost: number): SpellShopItem {
  return { id: `spell:${spellType}`, kind: 'spell', label, cost, tags: [SHOP_TAG_SPELL], spellType };
}

export function blockTagLabel(tag: BlockTag): string {
  if (tag === BlockTag.SPELL) return '法术';
  return tag;
}
