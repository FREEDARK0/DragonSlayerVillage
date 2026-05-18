import { TurnState } from '../core/GameState';
import { GameState } from '../core/GameState';
import { OctagonBoard } from '../core/OctagonBoard';
import { TurnManager } from '../core/TurnManager';
import { cloneShopItem } from '../config/blockTypes';
import { BlockData } from '../models/Block';
import { DragonState } from '../models/Dragon';
import { RelicSystem } from '../systems/RelicSystem';
import { ShopSystem, ShopSectionKey, ShopTargetIntent } from '../systems/ShopSystem';
import { createSeededRandom, RandomSource } from '../utils/random';
import { resetBlockIdCounter } from '../models/Block';
import { resetDragonInstanceCounter } from '../models/Dragon';
import { ActionV1, CompactReplayV1, COMPACT_REPLAY_SCHEMA_VERSION, isCompactReplayV1 } from '../telemetry/ReplaySchema';
import { currentDataHash, GAME_VERSION } from '../telemetry/GameVersion';
import { hashCoreState } from '../telemetry/CoreStateSerializer';

export interface PlaybackFrame {
  index: number;
  actionSeq: number | null;
  actionType: string;
  turn: number;
  expectedHash: string | null;
  actualHash: string;
  state: GameState;
  shop: ShopSystem;
}

export interface ReplayRunResult {
  ok: boolean;
  error?: string;
  mismatchIndex?: number;
  frames: PlaybackFrame[];
  state: GameState;
  shop: ShopSystem;
}

export interface ReplayRuntime {
  state: GameState;
  shop: ShopSystem;
  manager: TurnManager;
  random: RandomSource;
}

export function createReplayRuntime(seed: string): ReplayRuntime {
  resetBlockIdCounter();
  resetDragonInstanceCounter();
  const random = createSeededRandom(seed);
  const state = new GameState();
  const shop = new ShopSystem(random);
  const manager = new TurnManager(state, random);
  manager.onTurnStarted = () => shop.applyStartOfPlayerTurnEffects(state);
  manager.onRelicSelectionStarted = () => shop.cancelPlacement();
  manager.initWorld();
  shop.reset();
  return { state, shop, manager, random };
}

export async function runCompactReplay(replay: unknown): Promise<ReplayRunResult> {
  if (!isCompactReplayV1(replay)) {
    return emptyResult('回放文件格式不正确');
  }
  const compatibilityError = validateReplayCompatibility(replay);
  if (compatibilityError) return emptyResult(compatibilityError);

  const runtime = createReplayRuntime(replay.seed);
  const frames: PlaybackFrame[] = [];
  const initialHash = hashCoreState(runtime.state, runtime.shop);
  frames.push({
    index: 0,
    actionSeq: null,
    actionType: 'initial',
    turn: runtime.state.turnNumber,
    expectedHash: replay.turnHashes[0] ?? null,
    actualHash: initialHash,
    state: cloneGameState(runtime.state),
    shop: cloneShopSystem(runtime.shop),
  });

  if (replay.turnHashes[0] && replay.turnHashes[0] !== initialHash) {
    return {
      ok: false,
      error: '回放与当前版本不一致',
      mismatchIndex: 0,
      frames,
      state: runtime.state,
      shop: runtime.shop,
    };
  }

  let hashCursor = 1;
  for (const action of replay.actions) {
    await applyReplayAction(action, runtime);
    const actualHash = hashCoreState(runtime.state, runtime.shop);
    const shouldCheckHash = action.type === 'end_turn' || action.type === 'choose_relic';
    const expectedHash = shouldCheckHash ? replay.turnHashes[hashCursor++] ?? null : null;
    frames.push({
      index: frames.length,
      actionSeq: action.seq,
      actionType: action.type,
      turn: runtime.state.turnNumber,
      expectedHash,
      actualHash,
      state: cloneGameState(runtime.state),
      shop: cloneShopSystem(runtime.shop),
    });
    if (expectedHash && expectedHash !== actualHash) {
      return {
        ok: false,
        error: '回放与当前版本不一致',
        mismatchIndex: frames.length - 1,
        frames,
        state: runtime.state,
        shop: runtime.shop,
      };
    }
  }

  return { ok: true, frames, state: runtime.state, shop: runtime.shop };
}

export function validateReplayCompatibility(replay: CompactReplayV1): string | null {
  if (replay.schemaVersion !== COMPACT_REPLAY_SCHEMA_VERSION) return '回放 schema 版本不兼容';
  if (replay.gameVersion !== GAME_VERSION) return '回放 gameVersion 与当前版本不一致';
  if (replay.dataHash !== currentDataHash()) return '回放 dataHash 与当前数据不一致';
  return null;
}

async function applyReplayAction(action: ActionV1, runtime: ReplayRuntime): Promise<void> {
  const { state, shop, manager, random } = runtime;
  if (action.type === 'rotate') {
    const delta = numberPayload(action, 'delta', 0);
    if (state.turnState === TurnState.WAITING_FOR_INPUT && !shop.selectedItem()) {
      state.rotationAngle = normalizeRotation(state.rotationAngle + delta);
      state.turnRotationSteps += delta / 45;
    }
    return;
  }
  if (action.type === 'refresh') {
    shop.refreshRandom(state);
    return;
  }
  if (action.type === 'lock') {
    shop.toggleRandomLock(numberPayload(action, 'index', -1));
    return;
  }
  if (action.type === 'select_item') {
    const section = sectionPayload(action);
    const index = numberPayload(action, 'index', -1);
    if (section) shop.beginPlacementFromSection(section, index, state.board.villageGold);
    return;
  }
  if (action.type === 'place' || action.type === 'cast' || action.type === 'sell') {
    const section = sectionPayload(action);
    const index = numberPayload(action, 'index', -1);
    if (section) shop.beginPlacementFromSection(section, index, state.board.villageGold);
    shop.tryPlaceSelectedItem(state, sectorPayload(action), targetIntentPayload(action));
    return;
  }
  if (action.type === 'choose_relic') {
    const relicId = stringPayload(action, 'relicId');
    if (relicId && RelicSystem.selectPendingChoice(state, relicId)) manager.completeRelicSelection();
    return;
  }
  await manager.executeTurn(random, shop.getCombatStats(state));
}

function sectionPayload(action: ActionV1): ShopSectionKey | null {
  const section = action.payload.section;
  return section === 'base' || section === 'random' || section === 'temporary' ? section : null;
}

function targetIntentPayload(action: ActionV1): ShopTargetIntent {
  return action.payload.targetIntent === 'dragon' ? 'dragon' : 'block';
}

function sectorPayload(action: ActionV1): number | null {
  const sector = action.payload.sector;
  return typeof sector === 'number' ? sector : null;
}

function numberPayload(action: ActionV1, key: string, fallback: number): number {
  const value = action.payload[key];
  return typeof value === 'number' ? value : fallback;
}

function stringPayload(action: ActionV1, key: string): string | null {
  const value = action.payload[key];
  return typeof value === 'string' ? value : null;
}

function normalizeRotation(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  return ((Math.round(normalized / 45) * 45) % 360 + 360) % 360;
}

function emptyResult(error: string): ReplayRunResult {
  const runtime = createReplayRuntime('invalid-replay');
  return { ok: false, error, frames: [], state: runtime.state, shop: runtime.shop };
}

function cloneGameState(source: GameState): GameState {
  const clone = new GameState();
  clone.board = new OctagonBoard();
  clone.board.villageHp = source.board.villageHp;
  clone.board.villageGold = source.board.villageGold;
  clone.board.sectors = source.board.sectors.map(block => block ? cloneBlock(block) : null);
  clone.hero = { ...source.hero };
  clone.dragons = source.dragons.map(cloneDragon);
  clone.rotationAngle = source.rotationAngle;
  clone.turnRotationSteps = source.turnRotationSteps;
  clone.nightStart = source.nightStart;
  clone.nightLength = source.nightLength;
  clone.nightGrowing = source.nightGrowing;
  clone.turnState = source.turnState;
  clone.turnNumber = source.turnNumber;
  clone.year = source.year;
  clone.dragonGrowthRound = source.dragonGrowthRound;
  clone.skipRemainingDragonActions = source.skipRemainingDragonActions;
  clone.nextDragonSpawnSector = source.nextDragonSpawnSector;
  clone.rhythm = source.rhythm ? {
    ...source.rhythm,
    nodes: source.rhythm.nodes.map(node => ({ ...node })),
  } : null;
  clone.relics = {
    owned: source.relics.owned.map(relic => ({ ...relic })),
    pendingChoices: source.relics.pendingChoices.map(relic => ({ ...relic, description: [...relic.description] })),
    selectedChoiceId: source.relics.selectedChoiceId,
    goldCurseActiveThisTurn: source.relics.goldCurseActiveThisTurn,
    infantryLegacyBonus: source.relics.infantryLegacyBonus,
    rewardedDragonIds: [...source.relics.rewardedDragonIds],
  };
  clone.messages = [...source.messages];
  clone.gameOver = source.gameOver;
  clone.gameOverReason = source.gameOverReason;
  return clone;
}

function cloneBlock(block: BlockData): BlockData {
  return {
    ...block,
    tags: [...block.tags],
  };
}

function cloneDragon(dragon: DragonState): DragonState {
  return {
    ...dragon,
    announcedTargets: dragon.announcedTargets ? [...dragon.announcedTargets] : null,
  };
}

function cloneShopSystem(source: ShopSystem): ShopSystem {
  const clone = new ShopSystem(createSeededRandom('playback-frame'));
  clone.state.base = source.state.base.map(cloneShopItem);
  clone.state.random = source.state.random.map(slot => ({
    item: slot.item ? cloneShopItem(slot.item) : null,
    locked: slot.locked,
  }));
  clone.state.temporary = source.state.temporary.map(cloneShopItem);
  clone.state.refreshCost = source.state.refreshCost;
  clone.state.freeRefreshCredits = source.state.freeRefreshCredits;
  clone.state.nextPurchaseDiscount = source.state.nextPurchaseDiscount;
  clone.cancelPlacement();
  return clone;
}
