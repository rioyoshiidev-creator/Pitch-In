alter table leagues add column if not exists sort_order int not null default 0;
create index if not exists leagues_sort_order_idx on leagues(sort_order);
