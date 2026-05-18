export const COMPACT_REPLAY_SCHEMA_VERSION = 1;

export type ReplaySource = 'player' | 'bot';

export type ActionTypeV1 =
  | 'rotate'
  | 'select_item'
  | 'place'
  | 'cast'
  | 'refresh'
  | 'lock'
  | 'sell'
  | 'choose_relic'
  | 'end_turn';

export interface ActionV1 {
  turn: number;
  seq: number;
  type: ActionTypeV1;
  payload: Record<string, unknown>;
  result?: {
    ok: boolean;
    message?: string;
  };
}

export interface RunSummaryV1 {
  runId: string;
  source: ReplaySource;
  botId?: string;
  seed: string;
  gameVersion: string;
  dataHash: string;
  survivalTurn: number;
  deathRound: number | null;
  finalHp: number;
  finalGold: number;
  killerDragonTemplateId: string | null;
  score: number | null;
}

export interface TurnMetricsV1 {
  turn: number;
  hpStart: number;
  hpEnd: number;
  goldStart: number;
  goldEnd: number;
  income: number;
  spend: number;
  purchaseCount: number;
  aliveDragonCount: number;
  nightStart: number;
  nightLength: number;
  rhythmNodeType: string | null;
}

export interface ItemLifecycleV1 {
  blockId: number;
  itemId: string;
  createdTurn: number;
  destroyedTurn: number | null;
  damageTaken: number;
  damageDealt: number;
  goldProduced: number;
  goldFromDamage: number;
  sold: boolean;
}

export interface CompactReplayV1 {
  schemaVersion: typeof COMPACT_REPLAY_SCHEMA_VERSION;
  runId: string;
  source: ReplaySource;
  botId?: string;
  gameVersion: string;
  dataHash: string;
  seed: string;
  actions: ActionV1[];
  turnHashes: string[];
  summary: RunSummaryV1;
  turnMetrics: TurnMetricsV1[];
  itemLifecycles?: ItemLifecycleV1[];
}

export function isCompactReplayV1(value: unknown): value is CompactReplayV1 {
  if (!value || typeof value !== 'object') return false;
  const replay = value as Partial<CompactReplayV1>;
  return replay.schemaVersion === COMPACT_REPLAY_SCHEMA_VERSION
    && typeof replay.runId === 'string'
    && typeof replay.gameVersion === 'string'
    && typeof replay.dataHash === 'string'
    && typeof replay.seed === 'string'
    && Array.isArray(replay.actions)
    && Array.isArray(replay.turnHashes)
    && Array.isArray(replay.turnMetrics)
    && Boolean(replay.summary);
}
