# Telemetry, Simulation, Replay, and Leaderboard MVP

This project uses one compact replay schema for player runs, bot runs, local analysis, and future leaderboard verification.

## Default Replay Shape

Default uploads use compact replay data:

- `seed`
- `actions`
- `summary`
- `turnHashes`
- `turnMetrics`

Core frames are not uploaded by default. They should only be generated for debug captures or selected bot sample runs.

## Replay Contract

UI replay is same-version deterministic replay:

- `schemaVersion` must be supported.
- `gameVersion` must match the current build.
- `dataHash` must match generated data.
- Replayed `turnHashes` must match after rerunning actions.

If any check fails, the UI should refuse deterministic replay and show a version mismatch message.

## Supabase MVP

Apply `supabase/schema.sql`, create a private `replays` storage bucket, and deploy `supabase/functions/ingest-run`.

The Edge Function receives compact replay JSON, validates basic shape, stores replay JSON in Storage, and inserts:

- `runs`
- `turn_metrics`
- `replay_objects`
- `leaderboard_runs`

The first leaderboard pass is unverified. A later verification worker can rerun `seed + actions` and mark rows `verified = true`.

## Local Simulation

Run a small bot batch:

```sh
npm run sim -- --bot random --games 10 --seed local --out runs/random-smoke
```

Outputs:

- `summary.csv`
- `turn_metrics.csv`
- `replay-samples.json`

## Next Implementation Steps

1. Wire the in-game player action recorder to produce `CompactReplayV1`.
2. Add `ReplayMode` that reruns compact replay actions and renders generated playback states.
3. Add browser upload sink for Supabase Edge Function.
4. Add leaderboard panel filtered by `gameVersion + dataHash`.
