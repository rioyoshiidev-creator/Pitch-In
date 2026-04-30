-- sort_order: 管理者画面で並び順を制御するための列
alter table players add column if not exists sort_order int not null default 0;
create index if not exists players_sort_order_idx on players(sort_order);

-- api_team_id はスカッド同期で自動設定されるため nullable に変更
alter table players alter column api_team_id drop not null;
