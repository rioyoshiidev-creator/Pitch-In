-- 試合中の詳細ステータス（HT/1H/2H/ET/P等）を保存
alter table matches add column if not exists live_status text;
