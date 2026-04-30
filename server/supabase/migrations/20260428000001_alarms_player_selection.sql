alter table alarms
  add column if not exists selected_player_ids text[],
  add column if not exists sub_alarm_fired boolean not null default false;
