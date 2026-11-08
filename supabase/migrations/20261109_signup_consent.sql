begin;
create table if not exists public.hb_service_consents (
 member_id uuid primary key references public.hb_members(id) on delete cascade,
 version text not null, agreed_at timestamptz not null default now()
);
alter table public.hb_service_consents enable row level security;
revoke all on public.hb_service_consents from public,anon,authenticated;
grant all on public.hb_service_consents to service_role;

create or replace function public.hb_accept_service_consent(p_member uuid,p_version text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_version is distinct from '2026-11-08' then raise exception '최신 약관을 확인해 주세요.'; end if;
 if not exists(select 1 from hb_members where id=p_member) then raise exception '다시 로그인해 주세요.'; end if;
 insert into hb_service_consents(member_id,version) values(p_member,p_version)
 on conflict(member_id) do update set version=excluded.version,agreed_at=now();
 insert into hb_voice_consents(member_id,version) values(p_member,'2026-10-24')
 on conflict(member_id) do update set version=excluded.version,agreed_at=now();
end $$;

do $$ begin
 if to_regprocedure('public.hb_snapshot_before_signup_consent(uuid,bigint,integer)') is null then
  alter function public.hb_snapshot(uuid,bigint,integer) rename to hb_snapshot_before_signup_consent;
 end if;
end $$;
create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=public as $$
declare output jsonb;
begin
 output=hb_snapshot_before_signup_consent(p_member,p_after,p_limit);
 output=jsonb_set(output,'{member,serviceConsentVersion}',coalesce((
  select to_jsonb(s.version) from hb_service_consents s join hb_voice_consents v on v.member_id=s.member_id
   where s.member_id=p_member and v.version='2026-10-24'
 ),'null'::jsonb));
 return output;
end $$;
revoke all on function public.hb_accept_service_consent(uuid,text),public.hb_snapshot_before_signup_consent(uuid,bigint,integer),public.hb_snapshot(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.hb_accept_service_consent(uuid,text),public.hb_snapshot(uuid,bigint,integer) to service_role;
commit;
