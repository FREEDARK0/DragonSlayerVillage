import { CompactReplayV1 } from './ReplaySchema';
import { currentDataHash, GAME_VERSION } from './GameVersion';

export interface LeaderboardEntry {
  runId: string;
  displayName: string | null;
  score: number | null;
  survivalTurn: number;
  finalHp: number;
  finalGold: number;
  replayId: string | null;
  createdAt: string;
}

interface TelemetryConfig {
  supabaseUrl: string;
  anonKey: string;
  ingestUrl: string;
}

interface ViteTelemetryEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_INGEST_URL?: string;
}

export class SupabaseTelemetryClient {
  private config = readTelemetryConfig();

  isConfigured(): boolean {
    return Boolean(this.config);
  }

  async uploadReplay(replay: CompactReplayV1, displayName?: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.config) return { ok: false, error: 'telemetry_not_configured' };
    try {
      const response = await fetch(this.config.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.anonKey}`,
        },
        body: JSON.stringify({
          replay,
          leaderboard: {
            displayName,
            anonymousPlayerId: getAnonymousPlayerId(),
            mode: 'default',
          },
        }),
      });
      if (!response.ok) return { ok: false, error: `upload_http_${response.status}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'upload_failed' };
    }
  }

  async fetchLeaderboard(limit: number = 20): Promise<{ ok: boolean; rows: LeaderboardEntry[]; error?: string }> {
    if (!this.config) return { ok: false, rows: [], error: 'telemetry_not_configured' };
    const search = new URLSearchParams({
      select: 'runId,displayName,score,survivalTurn,finalHp,finalGold,replayId,createdAt',
      gameVersion: `eq.${GAME_VERSION}`,
      dataHash: `eq.${currentDataHash()}`,
      order: 'score.desc.nullslast,survivalTurn.desc,createdAt.desc',
      limit: String(Math.max(1, Math.min(100, limit))),
    });
    try {
      const response = await fetch(`${this.config.supabaseUrl}/rest/v1/leaderboard_runs?${search}`, {
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.anonKey}`,
        },
      });
      if (!response.ok) return { ok: false, rows: [], error: `leaderboard_http_${response.status}` };
      return { ok: true, rows: await response.json() as LeaderboardEntry[] };
    } catch (error) {
      return { ok: false, rows: [], error: error instanceof Error ? error.message : 'leaderboard_failed' };
    }
  }
}

function readTelemetryConfig(): TelemetryConfig | null {
  const env = import.meta.env as ViteTelemetryEnv;
  const supabaseUrl = trimTrailingSlash(env.VITE_SUPABASE_URL ?? '');
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) return null;
  const ingestUrl = env.VITE_SUPABASE_INGEST_URL
    ? env.VITE_SUPABASE_INGEST_URL
    : `${supabaseUrl}/functions/v1/ingest-run`;
  return { supabaseUrl, anonKey, ingestUrl };
}

function getAnonymousPlayerId(): string {
  const key = 'dragonSlayerVillage.anonymousPlayerId';
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `anon-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(36)}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'anonymous';
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
