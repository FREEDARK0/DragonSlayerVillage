import { GENERATED_ITEM_DATA } from './generatedData';

interface GeneratedItemRow {
  id: string;
  kind: string;
  blockType: string;
  spellType: string;
  label: string;
  cost: number;
  hp: number;
  attack: number;
  color: number;
  purchasable: boolean;
  baseShop: boolean;
  randomShop: boolean;
  tags: readonly string[];
  description: readonly string[];
}

const ITEM_ROWS: readonly GeneratedItemRow[] = GENERATED_ITEM_DATA;

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
  description: string[];
}

export const ITEM_DATA_BY_ID = new Map<string, GeneratedItemRow>(ITEM_ROWS.map(item => [item.id, item]));

export const ITEM_DATA_BY_BLOCK_TYPE = new Map(
  ITEM_ROWS
    .filter(item => item.kind === 'block' && item.blockType)
    .map(item => [item.blockType, item]),
);

export const ITEM_DATA_BY_SPELL_TYPE = new Map(
  ITEM_ROWS
    .filter(item => item.kind === 'spell' && item.spellType)
    .map(item => [item.spellType, item]),
);

export const BLOCK_TYPE_TABLE: Record<BlockType, BlockTypeDef> = Object.fromEntries(
  ITEM_ROWS
    .filter(item => item.kind === 'block' && item.blockType)
    .map(item => [
      item.blockType,
      {
        type: item.blockType as BlockType,
        label: item.label,
        color: item.color,
        hp: item.hp,
        attack: item.attack,
        purchasable: item.purchasable,
        description: [...item.description],
      },
    ]),
) as Record<BlockType, BlockTypeDef>;

export interface BaseShopItem {
  id: string;
  kind: 'block' | 'spell';
  label: string;
  cost: number;
  tags: string[];
  description: string[];
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

export const BASE_SHOP_ITEM_IDS = new Set<string>(ITEM_ROWS.filter(item => item.baseShop).map(item => item.id));

export const SHOP_ITEM_POOL: ShopItem[] = ITEM_ROWS
  .filter(item => item.purchasable && (item.baseShop || item.randomShop))
  .map(toShopItem);

export const BASE_SHOP_ITEMS = SHOP_ITEM_POOL.filter(item => BASE_SHOP_ITEM_IDS.has(item.id));
export const RANDOM_SHOP_POOL = SHOP_ITEM_POOL.filter(item => {
  const data = ITEM_DATA_BY_ID.get(item.id);
  return Boolean(data?.randomShop);
});

export function getBlockTypeDescriptions(type: BlockType): string[] {
  const description = BLOCK_TYPE_TABLE[type]?.description;
  return description ? [...description] : ['暂无效果'];
}

export function getSpellTypeDescriptions(spellType: SpellType): string[] {
  const description = ITEM_DATA_BY_SPELL_TYPE.get(spellType)?.description;
  return description ? [...description] : ['暂无说明'];
}

export function blockTagLabel(tag: BlockTag): string {
  if (tag === BlockTag.SPELL) return '法术';
  return tag;
}

function toShopItem(item: GeneratedItemRow): ShopItem {
  const base = {
    id: item.id,
    label: item.label,
    cost: item.cost,
    tags: [...item.tags],
    description: [...item.description],
  };

  if (item.kind === 'block') {
    if (!item.blockType) throw new Error(`Missing blockType for ${item.id}`);
    return {
      ...base,
      kind: 'block',
      blockType: item.blockType as BlockType,
      hp: item.hp,
      attack: item.attack,
    };
  }

  if (!item.spellType) throw new Error(`Missing spellType for ${item.id}`);
  return {
    ...base,
    kind: 'spell',
    spellType: item.spellType as SpellType,
  };
}
