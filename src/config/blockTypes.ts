import { GENERATED_ITEM_DATA, GENERATED_RELIC_DATA } from './generatedData';

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
const RELIC_ROWS: readonly GeneratedRelicRow[] = GENERATED_RELIC_DATA;

interface GeneratedRelicRow {
  id: string;
  label: string;
  color: number;
  iconKey: string;
  maxSelections: number | null;
  description: readonly string[];
}

export enum BlockType {
  KNIGHT = 'knight',
  MAGE = 'mage',
  WIZARD = 'wizard',
  VOODOO = 'voodoo',
  INFANTRY = 'infantry',
  SCOUT = 'scout',
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
  GHOST = 'ghost',
  GOBLIN = 'goblin',
  PRIEST = 'priest',
  MARKET = 'market',
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
  MAGIC_BOOK = 'magic_book',
  REPEL = 'repel',
  APPLE = 'apple',
}

export enum ShopActionType {
  SELL = 'sell',
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
  kind: 'block' | 'spell' | 'action';
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
  tempAttack?: number;
  temporary?: boolean;
  repelTemplateId?: string;
}

export interface ActionShopItem extends BaseShopItem {
  kind: 'action';
  actionType: ShopActionType;
  baseReward: number;
}

export type ShopItem = BlockShopItem | SpellShopItem | ActionShopItem;

export interface RelicDef {
  id: string;
  label: string;
  color: number;
  iconKey: string;
  maxSelections: number | null;
  description: string[];
}

export const SHOP_TAG_BASE = '基础';
export const SHOP_TAG_RANDOM = '随机';
export const SHOP_TAG_SPELL = '法术';
export const SHOP_TAG_ACTION = '操作';

export const SELL_SHOP_ITEM: ActionShopItem = {
  id: 'action:sell',
  kind: 'action',
  actionType: ShopActionType.SELL,
  label: '出售',
  cost: 0,
  baseReward: 3,
  tags: [SHOP_TAG_ACTION],
  description: ['出售一个友方建筑/单位，获得 3 金币', '不会触发销毁效果'],
};

export const BASE_SHOP_ITEM_IDS = new Set<string>(ITEM_ROWS.filter(item => item.baseShop).map(item => item.id));

export const SHOP_ITEM_POOL: ShopItem[] = ITEM_ROWS
  .filter(item => item.purchasable && (item.baseShop || item.randomShop))
  .map(toShopItem);

export const BASE_SHOP_ITEMS = [...SHOP_ITEM_POOL.filter(item => BASE_SHOP_ITEM_IDS.has(item.id)), SELL_SHOP_ITEM];
export const RANDOM_SHOP_POOL = SHOP_ITEM_POOL.filter(item => {
  const data = ITEM_DATA_BY_ID.get(item.id);
  return Boolean(data?.randomShop);
});

export const RELIC_DEFS: RelicDef[] = RELIC_ROWS.map(relic => ({
  id: relic.id,
  label: relic.label,
  color: relic.color,
  iconKey: relic.iconKey,
  maxSelections: relic.maxSelections,
  description: [...relic.description],
}));

export const RELIC_DEF_BY_ID = new Map<string, RelicDef>(RELIC_DEFS.map(relic => [relic.id, relic]));

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
    tempAttack: 0,
  };
}

export function cloneShopItem(item: ShopItem): ShopItem {
  if (item.kind === 'block') return { ...item, tags: [...item.tags], description: [...item.description] };
  if (item.kind === 'action') return { ...item, tags: [...item.tags], description: [...item.description] };
  return { ...item, tags: [...item.tags], description: [...item.description] };
}
