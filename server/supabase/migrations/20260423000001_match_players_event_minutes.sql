alter table match_players
  add column if not exists goal_minutes int[] not null default '{}',
  add column if not exists assist_minutes int[] not null default '{}';
