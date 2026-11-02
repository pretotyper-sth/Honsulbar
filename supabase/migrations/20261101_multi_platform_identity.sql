begin;
alter table public.hb_members add column if not exists signup_platform text;
alter table public.hb_members add column if not exists signup_provider text;
alter table public.hb_members add column if not exists last_login_platform text;
alter table public.hb_members add column if not exists last_login_at timestamptz;
update public.hb_members set signup_platform='toss',signup_provider='toss' where signup_platform is null and toss_key ~ '^[0-9]+$';
create or replace function public.hb_record_toss_origin() returns trigger language plpgsql set search_path=public as $$
begin
 if new.toss_key ~ '^[0-9]+$' then
  new.signup_platform:=coalesce(new.signup_platform,'toss');
  new.signup_provider:=coalesce(new.signup_provider,'toss');
 end if;
 return new;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='hb_member_signup_origin' and tgrelid='public.hb_members'::regclass) then
  create trigger hb_member_signup_origin before insert on public.hb_members for each row execute function public.hb_record_toss_origin();
 end if;
end $$;
create table if not exists public.hb_login_identities (
 provider text not null check(provider in ('toss','google','kakao')),
 subject_hash text not null,
 member_id uuid not null references public.hb_members on delete cascade,
 created_at timestamptz not null default now(),
 primary key(provider,subject_hash)
);
alter table public.hb_login_identities enable row level security;
revoke all on public.hb_login_identities from public,anon,authenticated;
grant all on public.hb_login_identities to service_role;
create or replace function public.hb_social_login(p_provider text,p_subject_hash text) returns uuid
language plpgsql security definer set search_path=public as $$
declare mid uuid; legacy_key text; begin
 if p_provider not in ('google','kakao') or p_subject_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_provider||':'||p_subject_hash,0));
 if exists(select 1 from hb_restrictions where identity_key=p_subject_hash and blocked_until>now() and delete_after>now()) then raise exception '이용이 제한된 계정이에요.'; end if;
 select member_id into mid from hb_login_identities where provider=p_provider and subject_hash=p_subject_hash;
 if mid is null then
  -- Keep legacy functions compatible without using a social ID as a Toss ID.
  legacy_key:='social:'||p_provider||':'||p_subject_hash;
  mid:=hb_login(legacy_key);
  update hb_members set adult=false,identity_key=p_subject_hash,signup_platform='android',signup_provider=p_provider where id=mid;
  insert into hb_login_identities(provider,subject_hash,member_id) values(p_provider,p_subject_hash,mid);
 end if;
 if exists(select 1 from hb_members where id=mid and banned_until>now()) then raise exception '이용이 제한된 계정이에요.'; end if;
 update hb_members set last_login_platform='android',last_login_at=now() where id=mid;
 return mid;
end $$;
revoke all on function public.hb_social_login(text,text) from public,anon,authenticated;
grant execute on function public.hb_social_login(text,text) to service_role;
create or replace function public.hb_link_social_identity(p_member uuid,p_provider text,p_subject_hash text) returns void
language plpgsql security definer set search_path=public as $$
declare owner_id uuid; begin
 if p_provider not in ('google','kakao') or p_subject_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_provider||':'||p_subject_hash,0));
 if not exists(select 1 from hb_members where id=p_member and (banned_until is null or banned_until<=now())) then raise exception '계정을 확인해 주세요.'; end if;
 if exists(select 1 from hb_restrictions where identity_key=p_subject_hash and blocked_until>now() and delete_after>now()) then raise exception '이용이 제한된 계정이에요.'; end if;
 select member_id into owner_id from hb_login_identities where provider=p_provider and subject_hash=p_subject_hash;
 if owner_id is not null and owner_id<>p_member then raise exception '이미 다른 계정에 연결된 로그인이에요.'; end if;
 insert into hb_login_identities(provider,subject_hash,member_id) values(p_provider,p_subject_hash,p_member) on conflict do nothing;
 perform hb_log('identity-linked',p_member,jsonb_build_object('provider',p_provider));
end $$;
revoke all on function public.hb_link_social_identity(uuid,text,text) from public,anon,authenticated;
grant execute on function public.hb_link_social_identity(uuid,text,text) to service_role;
commit;
