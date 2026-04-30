-- players.api_team_id を nullable にする
-- syncJapanesePlayers でどのスカッドにも見つからなかった選手を null にできるようにする
alter table players alter column api_team_id drop not null;
