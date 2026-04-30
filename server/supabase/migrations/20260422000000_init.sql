-- ============================================================
-- PITCH-IN Supabase スキーマ
-- ============================================================

-- リーグマスタ（手動登録）
create table if not exists leagues (
  id int primary key,               -- API-Football の league.id
  name text not null,
  current_season int not null,
  fetch_teams boolean not null default true,   -- チーム取得対象か（カップ戦はfalseにする等）
  created_at timestamptz default now()
);

-- チームマスタ（APIから自動取得）
create table if not exists teams (
  id int primary key,               -- API-Football の team.id
  name text not null,
  league_id int references leagues(id),
  has_japanese boolean not null default false,
  updated_at timestamptz default now()
);

-- 選手マスタ（手動で name + api_player_id + api_team_id を登録）
-- position・number はスカッド同期で自動補完
create table if not exists players (
  id text primary key,              -- 例: "player-1237"
  name text not null,
  api_player_id int unique not null,
  api_team_id int not null references teams(id),   -- 手動登録時に必須
  position text,
  number int,
  updated_at timestamptz default now()
);

-- 試合マスタ（has_japanese=true のチームの試合のみ保存）
create table if not exists matches (
  id text primary key,              -- 例: "fixture-1234567"
  api_fixture_id int unique not null,
  home_team_id int references teams(id),
  away_team_id int references teams(id),
  home_score int,
  away_score int,
  date timestamptz not null,
  status text not null default 'scheduled',
  current_minute int,
  lineup_fetched boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists matches_date_idx on matches(date);
create index if not exists matches_status_idx on matches(status);

-- 試合×選手（スタメン・ベンチ・得点・交代）
create table if not exists match_players (
  match_id text references matches(id) on delete cascade,
  player_id text references players(id) on delete cascade,
  status text not null default 'unknown',
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
  platform text not null default 'ios',
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
  alarm_timing text not null default 'before_kickoff',
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
  event_type text not null,
  sent_at timestamptz default now(),
  unique (match_id, player_id, event_type)
);
