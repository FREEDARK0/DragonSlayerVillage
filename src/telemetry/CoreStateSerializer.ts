import { GameState } from '../core/GameState';
import { ShopSystem } from '../systems/ShopSystem';

export interface CoreStateSnapshotV1 {
  turnNumber: number;
  year: number;
  villageHp: number;
  villageGold: number;
  rotationAngle: number;
  turnRotationSteps: number;
  nightStart: number;
  nightLength: number;
  nightGrowing: boolean;
  dragonGrowthRound: number;
  board: Array<{
    id: number;
    type: string;
    hp: number;
    attack: number;
    shielded: boolean;
    tags: string[];
    targetDragonId?: string;
  } | null>;
  dragons: Array<{
    id: string;
    templateId: string;
    hp: number;
    maxHp: number;
    attack: number;
    isAlive: boolean;
    edgeIndex: number;
    turnCounter: number;
    readyToAttackTurn: number;
    respawnAvailableTurn: number | null;
  }>;
  shop: {
    base: string[];
    random: Array<{ id: string | null; locked: boolean }>;
    temporary: string[];
    refreshCost: number;
    freeRefreshCredits: number;
    nextPurchaseDiscount: number;
    selectedItemId: string | null;
  };
  relics: {
    owned: Array<{ id: string; count: number }>;
    pendingChoices: string[];
    selectedChoiceId: string | null;
  };
  rhythm: {
    round: number;
    nodeIndex: number;
    roundLength: number;
    lastTriggeredIndex: number | null;
    nodes: Array<{ type: string; triggered: boolean; eventKind?: string }>;
  } | null;
}

export function serializeCoreState(state: GameState, shop: ShopSystem): CoreStateSnapshotV1 {
  return {
    turnNumber: state.turnNumber,
    year: state.year,
    villageHp: state.board.villageHp,
    villageGold: state.board.villageGold,
    rotationAngle: state.rotationAngle,
    turnRotationSteps: state.turnRotationSteps,
    nightStart: state.nightStart,
    nightLength: state.nightLength,
    nightGrowing: state.nightGrowing,
    dragonGrowthRound: state.dragonGrowthRound,
    board: state.board.sectors.map(block => block ? {
      id: block.id,
      type: block.type,
      hp: block.hp,
      attack: block.attack,
      shielded: block.shielded,
      tags: [...block.tags].sort(),
      targetDragonId: block.targetDragonId,
    } : null),
    dragons: state.dragons.map(dragon => ({
      id: dragon.id,
      templateId: dragon.templateId,
      hp: dragon.hp,
      maxHp: dragon.maxHp,
      attack: dragon.attack,
      isAlive: dragon.isAlive,
      edgeIndex: dragon.edgeIndex,
      turnCounter: dragon.turnCounter,
      readyToAttackTurn: dragon.readyToAttackTurn,
      respawnAvailableTurn: dragon.respawnAvailableTurn,
    })),
    shop: {
      base: shop.state.base.map(item => item.id),
      random: shop.state.random.map(slot => ({ id: slot.item?.id ?? null, locked: slot.locked })),
      temporary: shop.state.temporary.map(item => item.id),
      refreshCost: shop.state.refreshCost,
      freeRefreshCredits: shop.state.freeRefreshCredits,
      nextPurchaseDiscount: shop.state.nextPurchaseDiscount,
      selectedItemId: shop.selectedItem()?.item.id ?? null,
    },
    relics: {
      owned: state.relics.owned.map(relic => ({ ...relic })).sort((a, b) => a.id.localeCompare(b.id)),
      pendingChoices: state.relics.pendingChoices.map(relic => relic.id),
      selectedChoiceId: state.relics.selectedChoiceId,
    },
    rhythm: state.rhythm ? {
      round: state.rhythm.round,
      nodeIndex: state.rhythm.nodeIndex,
      roundLength: state.rhythm.roundLength,
      lastTriggeredIndex: state.rhythm.lastTriggeredIndex,
      nodes: state.rhythm.nodes.map(node => ({
        type: node.type,
        triggered: node.triggered,
        eventKind: node.eventKind,
      })),
    } : null,
  };
}

export function hashCoreState(state: GameState, shop: ShopSystem): string {
  return fnv1a64(stableStringify(serializeCoreState(state, shop)));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
}

export function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
