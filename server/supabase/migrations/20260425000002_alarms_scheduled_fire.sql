alter table alarms
  add column if not exists scheduled_fire_time timestamptz,
  add column if not exists is_fired boolean not null default false;

create index if not exists alarms_fire_idx
  on alarms(scheduled_fire_time)
  where is_fired = false and is_enabled = true;
