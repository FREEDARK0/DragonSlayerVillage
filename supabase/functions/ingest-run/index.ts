import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type CompactReplayPayload = {
  schemaVersion: number;
  runId: string;
  source: 'player' | 'bot';
  botId?: string;
  gameVersion: string;
  dataHash: string;
  seed: string;
  actions: unknown[];
  turnHashes: string[];
  summary: {
    runId: string;
    source: 'player' | 'bot';
    botId?: string;
    seed: string;
    gameVersion: string;
    dataHash: string;
    survivalTurn: number;
    finalHp: number;
    finalGold: number;
    killerDragonTemplateId: string | null;
    score: number | null;
  };
  turnMetrics: Array<{ turn: number } & Record<string, unknown>>;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRole) return json({ error: 'missing_supabase_env' }, 500);

  let replay: CompactReplayPayload;
  try {
    replay = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const validation = validateReplay(replay);
  if (validation) return json({ error: validation }, 400);

  const supabase = createClient(url, serviceRole);
  const replayPath = `replays/${replay.gameVersion}/${replay.runId}.json`;
  const replayBody = JSON.stringify(replay);

  const { error: storageError } = await supabase.storage
    .from('replays')
    .upload(replayPath, replayBody, {
      contentType: 'application/json',
      upsert: true,
    });
  if (storageError) return json({ error: storageError.message }, 500);

  const { error: runError } = await supabase.from('runs').upsert({
    run_id: replay.runId,
    source: replay.source,
    bot_id: replay.botId ?? null,
    game_version: replay.gameVersion,
    data_hash: replay.dataHash,
    seed: replay.seed,
    survival_turn: replay.summary.survivalTurn,
    final_hp: replay.summary.finalHp,
    final_gold: replay.summary.finalGold,
    killer_dragon_template_id: replay.summary.killerDragonTemplateId,
    score: replay.summary.score,
    summary_json: replay.summary,
  });
  if (runError) return json({ error: runError.message }, 500);

  const { error: metricsError } = await supabase.from('turn_metrics').upsert(
    replay.turnMetrics.map(row => ({
      run_id: replay.runId,
      turn: row.turn,
      metrics_json: row,
    })),
  );
  if (metricsError) return json({ error: metricsError.message }, 500);

  await supabase.from('replay_objects').upsert({
    run_id: replay.runId,
    storage_path: replayPath,
    compressed_size: replayBody.length,
    action_count: replay.actions.length,
    turn_hash_count: replay.turnHashes.length,
  });

  await supabase.from('leaderboard_runs').upsert({
    run_id: replay.runId,
    game_version: replay.gameVersion,
    data_hash: replay.dataHash,
    mode: 'standard',
    score: replay.summary.score,
    survival_turn: replay.summary.survivalTurn,
    final_hp: replay.summary.finalHp,
    final_gold: replay.summary.finalGold,
    replay_id: replayPath,
    verified: false,
  });

  return json({ ok: true, runId: replay.runId });
});

function validateReplay(replay: CompactReplayPayload): string | null {
  if (!replay || typeof replay !== 'object') return 'missing_replay';
  if (replay.schemaVersion !== 1) return 'unsupported_schema';
  if (!replay.runId || replay.runId !== replay.summary?.runId) return 'invalid_run_id';
  if (!replay.gameVersion || replay.gameVersion !== replay.summary.gameVersion) return 'invalid_game_version';
  if (!replay.dataHash || replay.dataHash !== replay.summary.dataHash) return 'invalid_data_hash';
  if (!Array.isArray(replay.actions) || !Array.isArray(replay.turnHashes) || !Array.isArray(replay.turnMetrics)) return 'invalid_arrays';
  if (replay.actions.length > 2000 || replay.turnMetrics.length > 500) return 'payload_too_large';
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
