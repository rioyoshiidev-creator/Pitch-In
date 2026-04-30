-- チームを削除した際、matches の team_id を NULL にセット（試合履歴を保持したままチームをリセット可能にする）
alter table matches
  drop constraint if exists matches_home_team_id_fkey,
  drop constraint if exists matches_away_team_id_fkey;

alter table matches
  add constraint matches_home_team_id_fkey
    foreign key (home_team_id) references teams(id) on delete set null,
  add constraint matches_away_team_id_fkey
    foreign key (away_team_id) references teams(id) on delete set null;
