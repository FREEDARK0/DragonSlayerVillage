import { GameState } from '../core/GameState';
import { ShopSystem } from '../systems/ShopSystem';
import { ActionTypeV1, ActionV1, COMPACT_REPLAY_SCHEMA_VERSION, CompactReplayV1, RunSummaryV1, TurnMetricsV1 } from './ReplaySchema';
import { currentDataHash, GAME_VERSION } from './GameVersion';
import { hashCoreState } from './CoreStateSerializer';

interface TurnStartSnapshot {
  turn: number;
  hp: number;
  gold: number;
}

export class GameRecorder {
  private runId = '';
  private seed = '';
  private seq = 0;
  private actions: ActionV1[] = [];
  private turnHashes: string[] = [];
  private turnMetrics: TurnMetricsV1[] = [];
  private turnStart: TurnStartSnapshot | null = null;
  private purchaseCountThisTurn = 0;

  start(seed: string, state: GameState, shop: ShopSystem): void {
    this.runId = createRunId('player');
    this.seed = seed;
    this.seq = 0;
    this.actions = [];
    this.turnHashes = [hashCoreState(state, shop)];
    this.turnMetrics = [];
    this.turnStart = snapshotTurnStart(state);
    this.purchaseCountThisTurn = 0;
  }

  recordAction(state: GameState, type: ActionTypeV1, payload: Record<string, unknown> = {}, result?: { ok: boolean; message?: string }): ActionV1 {
    const action: ActionV1 = {
      turn: state.turnNumber,
      seq: this.seq++,
      type,
      payload,
      result,
    };
    this.actions.push(action);
    if ((type === 'place' || type === 'cast' || type === 'sell') && result?.ok) {
      this.purchaseCountThisTurn++;
    }
    return action;
  }

  recordTurnBoundary(state: GameState, shop: ShopSystem, includeMetrics: boolean): void {
    this.turnHashes.push(hashCoreState(state, shop));
    if (includeMetrics && this.turnStart) {
      this.turnMetrics.push(buildTurnMetrics(state, this.turnStart, this.purchaseCountThisTurn));
    }
    this.turnStart = snapshotTurnStart(state);
    this.purchaseCountThisTurn = 0;
  }

  buildReplay(state: GameState, shop: ShopSystem): CompactReplayV1 {
    return {
      schemaVersion: COMPACT_REPLAY_SCHEMA_VERSION,
      runId: this.runId,
      source: 'player',
      gameVersion: GAME_VERSION,
      dataHash: currentDataHash(),
      seed: this.seed,
      actions: [...this.actions],
      turnHashes: [...this.turnHashes],
      summary: this.buildSummary(state),
      turnMetrics: [...this.turnMetrics],
    };
  }

  actionCount(): number {
    return this.actions.length;
  }

  private buildSummary(state: GameState): RunSummaryV1 {
    return {
      runId: this.runId,
      source: 'player',
      seed: this.seed,
      gameVersion: GAME_VERSION,
      dataHash: currentDataHash(),
      survivalTurn: state.turnNumber,
      deathRound: state.gameOver ? state.rhythm?.round ?? null : null,
      finalHp: state.board.villageHp,
      finalGold: state.board.villageGold,
      killerDragonTemplateId: null,
      score: null,
    };
  }
}

function snapshotTurnStart(state: GameState): TurnStartSnapshot {
  return { hp: state.board.villageHp, gold: state.board.villageGold, turn: state.turnNumber };
}

function buildTurnMetrics(state: GameState, start: TurnStartSnapshot, purchaseCount: number): TurnMetricsV1 {
  return {
    turn: start.turn,
    hpStart: start.hp,
    hpEnd: state.board.villageHp,
    goldStart: start.gold,
    goldEnd: state.board.villageGold,
    income: Math.max(0, state.board.villageGold - start.gold),
    spend: Math.max(0, start.gold - state.board.villageGold),
    purchaseCount,
    aliveDragonCount: state.aliveDragons.length,
    nightStart: state.nightStart,
    nightLength: state.nightLength,
    rhythmNodeType: state.rhythm?.nodes[state.rhythm.lastTriggeredIndex ?? -1]?.type ?? null,
  };
}

function createRunId(prefix: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  return `${prefix}-${suffix}`;
}
