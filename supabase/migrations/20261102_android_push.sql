begin;
create table if not exists public.hb_push_devices (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 member_id uuid not null references public.hb_members(id) on delete cascade,
 session_hash text references public.hb_sessions(token_hash) on delete cascade,
 token text not null check(length(token) between 32 and 4096),
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.hb_push_devices add column if not exists session_hash text references public.hb_sessions(token_hash) on delete cascade;
create index if not exists hb_push_devices_member on public.hb_push_devices(member_id) where enabled;
alter table public.hb_push_devices enable row level security;
revoke all on public.hb_push_devices from public,anon,authenticated;
grant all on public.hb_push_devices to service_role;
commit;
