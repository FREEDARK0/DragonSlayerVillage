-- Dragon Slayer Village telemetry and leaderboard MVP schema.
-- Apply in Supabase SQL editor after creating the project.

create table if not exists public.runs (
  run_id text primary key,
  source text not null check (source in ('player', 'bot')),
  bot_id text,
  anonymous_player_id text,
  game_version text not null,
  data_hash text not null,
  seed text not null,
  survival_turn integer not null,
  final_hp integer not null,
  final_gold integer not null,
  killer_dragon_template_id text,
  score numeric,
  summary_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.turn_metrics (
  run_id text not null references public.runs(run_id) on delete cascade,
  turn integer not null,
  metrics_json jsonb not null,
  primary key (run_id, turn)
);

create table if not exists public.replay_objects (
  run_id text primary key references public.runs(run_id) on delete cascade,
  storage_path text not null,
  compressed_size integer,
  action_count integer not null,
  turn_hash_count integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_runs (
  run_id text primary key references public.runs(run_id) on delete cascade,
  anonymous_player_id text,
  display_name text,
  game_version text not null,
  data_hash text not null,
  mode text not null default 'standard',
  score numeric,
  survival_turn integer not null,
  final_hp integer not null,
  final_gold integer not null,
  replay_id text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_current_idx
  on public.leaderboard_runs (game_version, data_hash, mode, verified, score desc, survival_turn desc);

alter table public.runs enable row level security;
alter table public.turn_metrics enable row level security;
alter table public.replay_objects enable row level security;
alter table public.leaderboard_runs enable row level security;

create policy "leaderboard public read"
  on public.leaderboard_runs for select
  using (true);

-- Writes should go through Edge Functions using the service role key.
