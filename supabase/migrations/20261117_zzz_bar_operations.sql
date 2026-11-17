begin;

create table if not exists public.hb_bar_operations (
  id integer primary key check (id = 1),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz,
  updated_by text
);
insert into public.hb_bar_operations (id) values (1) on conflict do nothing;
alter table public.hb_bar_operations enable row level security;
revoke all on public.hb_bar_operations from public, anon, authenticated;
grant select, update on public.hb_bar_operations to service_role;

commit;
