-- ============================================================
-- PITCH-IN Supabase スキーマ
-- ============================================================

-- 選手マスタ（週1回更新）
create table if not exists players (
  id text primary key,                  -- 例: "mitoma"
  name text not null,
  team text not null,
  league text not null,
  league_id text not null,
  position text not null,
  number int not null,
  api_player_id int unique not null,    -- API-Football の player.id
  api_team_id int not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 試合マスタ（日1回 + ライブ更新）
create table if not exists matches (
  id text primary key,                  -- 例: "fixture-1234567"
  api_fixture_id int unique not null,
  home_team text not null,
  away_team text not null,
  home_team_id int not null,
  away_team_id int not null,
  home_score int,
  away_score int,
  date timestamptz not null,
  league text not null,
  league_id text not null,
  status text not null default 'scheduled',
  current_minute int,
  lineup_fetched boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 試合×選手（スタメン・ベンチ・ベンチ外・得点等）
create table if not exists match_players (
  match_id text references matches(id) on delete cascade,
  player_id text references players(id) on delete cascade,
  status text not null default 'unknown',   -- starter/bench/not_selected/unknown
  minute_in int,
  minute_out int,
  goals int not null default 0,
  assists int not null default 0,
  primary key (match_id, player_id)
);

-- デバイス登録
create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  push_token text not null,
  platform text not null default 'ios',     -- ios / android
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists devices_push_token_idx on devices(push_token);

-- フォロー中の選手（デバイスごと）
create table if not exists followed_players (
  device_id uuid references devices(id) on delete cascade,
  player_id text references players(id) on delete cascade,
  notify_lineup boolean not null default true,
  notify_substitution boolean not null default false,
  notify_goal boolean not null default false,
  notify_assist boolean not null default false,
  created_at timestamptz default now(),
  primary key (device_id, player_id)
);

-- アラーム設定（試合単位）
create table if not exists alarms (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references devices(id) on delete cascade,
  match_id text references matches(id) on delete cascade,
  alarm_timing text not null default 'before_kickoff',   -- before_kickoff / lineup
  minutes_before int not null default 5,
  notify_substitution boolean not null default true,
  is_enabled boolean not null default true,
  snooze boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (device_id, match_id)
);

-- 通知送信済みログ（二重送信防止）
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  match_id text not null,
  player_id text not null,
  event_type text not null,   -- lineup/substitution/goal/assist/not_selected
  sent_at timestamptz default now(),
  unique (match_id, player_id, event_type)
);
