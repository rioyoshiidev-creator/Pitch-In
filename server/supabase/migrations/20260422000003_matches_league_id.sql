alter table matches add column if not exists league_id int references leagues(id);
