begin;
create table if not exists public.hb_account_transfers (
 member_id uuid primary key references public.hb_members(id) on delete cascade,
 session_hash text not null references public.hb_sessions(token_hash) on delete cascade,
 code_hash text not null unique check(code_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 used_at timestamptz
);
alter table public.hb_account_transfers enable row level security;
revoke all on public.hb_account_transfers from public,anon,authenticated;
grant all on public.hb_account_transfers to service_role;

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
 insert into hb_bonus_claims(key_hash) values(encode(sha256(convert_to('hb:social:'||p_provider||':'||p_subject_hash,'UTF8')),'hex')) on conflict do nothing;
 perform hb_log('identity-linked',p_member,jsonb_build_object('provider',p_provider));
end $$;
revoke all on function public.hb_link_social_identity(uuid,text,text) from public,anon,authenticated;
grant execute on function public.hb_link_social_identity(uuid,text,text) to service_role;

create or replace function public.hb_new_account_transfer(p_member uuid,p_session text,p_code_hash text,p_provider text default null,p_subject_hash text default null) returns timestamptz
language plpgsql security definer set search_path=public as $$
declare expiry timestamptz:=now()+interval '5 minutes'; m hb_members; s hb_sessions; begin
 if p_code_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid link code'; end if;
 select * into m from hb_members where id=p_member for update;
 select * into s from hb_sessions where token_hash=p_session and member_id=p_member and expires_at>now() for share;
 if m.id is null or s.member_id is null or m.banned_until>now() then raise exception '계정을 다시 확인해 주세요.'; end if;
 if s.platform='toss' then
  if s.expires_at<=now()+interval '7 days'-interval '10 minutes' or m.toss_key !~ '^[0-9]{1,30}$' or not m.adult then raise exception '토스 로그인을 다시 확인해 주세요.'; end if;
 elsif s.platform='android' then
  if p_provider is null or p_subject_hash is null or p_provider not in ('google','kakao') or not exists(select 1 from hb_login_identities where provider=p_provider and subject_hash=p_subject_hash and member_id=p_member) then raise exception '현재 계정의 Google·카카오 로그인을 확인해 주세요.'; end if;
 else raise exception '계정을 다시 확인해 주세요.'; end if;
 insert into hb_account_transfers(member_id,session_hash,code_hash,expires_at) values(p_member,p_session,p_code_hash,expiry)
 on conflict(member_id) do update set session_hash=excluded.session_hash,code_hash=excluded.code_hash,expires_at=excluded.expires_at,used_at=null;
 return expiry;
end $$;

create or replace function public.hb_claim_account_transfer(p_code_hash text,p_provider text,p_subject_hash text,p_toss_key text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare link hb_account_transfers; m hb_members; s hb_sessions; owner_id uuid; begin
 if p_provider is null or p_provider not in ('google','kakao','toss') or p_subject_hash is null or p_subject_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid identity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_provider||':'||p_subject_hash,0));
 select * into link from hb_account_transfers where code_hash=p_code_hash;
 if link.member_id is null then raise exception '연결 코드가 만료됐어요. 원래 앱에서 새 코드를 받아 주세요.'; end if;
 select * into m from hb_members where id=link.member_id for update;
 select * into s from hb_sessions where token_hash=link.session_hash and member_id=link.member_id and expires_at>now() for share;
 select * into link from hb_account_transfers where code_hash=p_code_hash for update;
 if link.member_id is null or link.used_at is not null or link.expires_at<=now() or s.member_id is null then raise exception '연결 코드가 만료됐어요. 원래 앱에서 새 코드를 받아 주세요.'; end if;
 if m.id is null or m.banned_until>now() or exists(select 1 from hb_restrictions where identity_key in(m.identity_key,p_subject_hash) and blocked_until>now() and delete_after>now()) then raise exception '이용이 제한된 계정이에요.'; end if;
 if p_provider in ('google','kakao') then
  if s.platform<>'toss' then raise exception '앱인토스에서 받은 연결 코드를 입력해 주세요.'; end if;
  perform hb_link_social_identity(link.member_id,p_provider,p_subject_hash);
 else
  if s.platform<>'android' then raise exception 'Android 앱에서 받은 연결 코드를 입력해 주세요.'; end if;
  if p_toss_key is null or p_toss_key !~ '^[0-9]{1,30}$' or p_toss_key='0' then raise exception 'Invalid Toss identity'; end if;
  select id into owner_id from hb_members where toss_key=p_toss_key;
  if owner_id is not null and owner_id<>m.id then raise exception '이미 다른 계정에 연결된 토스 로그인이에요.'; end if;
  select member_id into owner_id from hb_login_identities where provider='toss' and subject_hash=p_subject_hash;
  if owner_id is not null and owner_id<>m.id then raise exception '이미 다른 계정에 연결된 토스 로그인이에요.'; end if;
  if m.toss_key ~ '^[0-9]+$' and m.toss_key<>p_toss_key then raise exception '이미 다른 토스 계정과 연결되어 있어요.'; end if;
  begin
   update hb_members set toss_key=p_toss_key,identity_key=p_subject_hash,adult=true where id=m.id;
  exception when unique_violation then raise exception '이미 다른 계정에 연결된 토스 로그인이에요.'; end;
  insert into hb_login_identities(provider,subject_hash,member_id) values('toss',p_subject_hash,m.id) on conflict do nothing;
  insert into hb_bonus_claims(key_hash) values(encode(sha256(convert_to('hb:'||p_toss_key,'UTF8')),'hex')) on conflict do nothing;
  perform hb_log('identity-linked',m.id,jsonb_build_object('provider','toss'));
 end if;
 update hb_account_transfers set used_at=now() where member_id=link.member_id;
 update hb_members set last_login_platform=case when p_provider='toss' then 'toss' else 'android' end,last_login_at=now() where id=link.member_id;
 return link.member_id;
end $$;
revoke all on function public.hb_new_account_transfer(uuid,text,text,text,text),public.hb_claim_account_transfer(text,text,text,text) from public,anon,authenticated;
grant execute on function public.hb_new_account_transfer(uuid,text,text,text,text),public.hb_claim_account_transfer(text,text,text,text) to service_role;
do $$ begin
 if to_regprocedure('public.hb_restrict_before_platform_links(uuid,timestamptz,boolean,text,boolean)') is null then
  alter function public.hb_restrict(uuid,timestamptz,boolean,text,boolean) rename to hb_restrict_before_platform_links;
 end if;
end $$;
create or replace function public.hb_restrict(p_member uuid,p_until timestamptz default null,p_kick boolean default true,p_reason text default '',p_set_ban boolean default true) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform hb_restrict_before_platform_links(p_member,p_until,p_kick,p_reason,p_set_ban);
 if p_set_ban then
  if p_until is null then
   delete from hb_restrictions where identity_key in(select subject_hash from hb_login_identities where member_id=p_member);
  else
   insert into hb_restrictions(identity_key,blocked_until,delete_after)
   select subject_hash,p_until,case when p_until>'9000-01-01' then now()+interval '3 years' else p_until+interval '1 year' end from hb_login_identities where member_id=p_member
   on conflict(identity_key) do update set blocked_until=excluded.blocked_until,delete_after=excluded.delete_after,updated_at=now();
  end if;
 end if;
end $$;
revoke all on function public.hb_restrict(uuid,timestamptz,boolean,text,boolean),public.hb_restrict_before_platform_links(uuid,timestamptz,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.hb_restrict(uuid,timestamptz,boolean,text,boolean),public.hb_restrict_before_platform_links(uuid,timestamptz,boolean,text,boolean) to service_role;
do $$ begin
 if to_regprocedure('public.hb_retention_before_platform_links()') is null then
  alter function public.hb_retention() rename to hb_retention_before_platform_links;
 end if;
end $$;
create or replace function public.hb_retention() returns void language plpgsql security definer set search_path=public as $$
begin
 perform hb_retention_before_platform_links();
 delete from hb_account_transfers where expires_at<=now() or used_at is not null;
end $$;
revoke all on function public.hb_retention(),public.hb_retention_before_platform_links() from public,anon,authenticated;
grant execute on function public.hb_retention(),public.hb_retention_before_platform_links() to service_role;
commit;
