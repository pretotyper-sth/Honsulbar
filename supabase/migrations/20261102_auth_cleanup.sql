begin;
alter table public.hb_login_identities add column if not exists auth_user_id uuid;
create index if not exists hb_identity_auth_user on public.hb_login_identities(auth_user_id);
create table if not exists public.hb_auth_cleanup (
 auth_user_id uuid primary key,status text not null default 'pending' check(status in ('pending','deleting','retained','done')),
 next_attempt_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.hb_auth_cleanup enable row level security;
revoke all on public.hb_auth_cleanup from public,anon,authenticated;
grant all on public.hb_auth_cleanup to service_role;
create or replace function public.hb_social_auth(p_auth_user uuid,p_provider text,p_subject_hash text,p_mode text,p_member uuid default null,p_code_hash text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare mid uuid; begin
 if p_auth_user is null then raise exception 'Invalid auth user'; end if;
 perform pg_advisory_xact_lock(hashtextextended('auth-cleanup:'||p_auth_user,0));
 if exists(select 1 from hb_auth_cleanup where auth_user_id=p_auth_user and status in ('deleting','done')) then raise exception '로그인 정보 정리 중이에요. 잠시 후 다시 로그인해 주세요.'; end if;
 if p_mode='login' then mid:=hb_social_login(p_provider,p_subject_hash);
 elsif p_mode='link' then perform hb_link_social_identity(p_member,p_provider,p_subject_hash);mid:=p_member;
 elsif p_mode='claim' then mid:=hb_claim_account_transfer(p_code_hash,p_provider,p_subject_hash,null);
 else raise exception 'Invalid auth mode'; end if;
 update hb_login_identities set auth_user_id=p_auth_user where provider=p_provider and subject_hash=p_subject_hash and member_id=mid;
 update hb_auth_cleanup set status='retained',updated_at=now() where auth_user_id=p_auth_user and status='pending';
 return mid;
end $$;
create or replace function public.hb_queue_auth_cleanup() returns trigger language plpgsql security definer set search_path=public as $$
declare aid uuid; begin
 for aid in select distinct auth_user_id from hb_login_identities where member_id=old.id and auth_user_id is not null loop
  insert into hb_auth_cleanup(auth_user_id) values(aid) on conflict(auth_user_id) do update set status='pending',next_attempt_at=now(),updated_at=now();
 end loop;
 return old;
end $$;
drop trigger if exists hb_member_auth_cleanup on public.hb_members;
create trigger hb_member_auth_cleanup before delete on public.hb_members for each row execute function public.hb_queue_auth_cleanup();
create or replace function public.hb_claim_auth_cleanup(p_auth_user uuid,p_subject_hashes text[]) returns boolean
language plpgsql security definer set search_path=public as $$
declare q hb_auth_cleanup; begin
 perform pg_advisory_xact_lock(hashtextextended('auth-cleanup:'||p_auth_user,0));
 select * into q from hb_auth_cleanup where auth_user_id=p_auth_user for update;
 if q.auth_user_id is null or q.status not in ('pending','deleting','retained') or q.next_attempt_at>now() then return false; end if;
 if exists(select 1 from hb_login_identities where auth_user_id=p_auth_user or subject_hash=any(coalesce(p_subject_hashes,array[]::text[]))) then
  update hb_auth_cleanup set status='retained',next_attempt_at=now()+interval '1 day',updated_at=now() where auth_user_id=p_auth_user;return false;
 end if;
 update hb_auth_cleanup set status='deleting',next_attempt_at=now()+interval '5 minutes',updated_at=now() where auth_user_id=p_auth_user;
 return true;
end $$;
revoke all on function public.hb_social_auth(uuid,text,text,text,uuid,text),public.hb_queue_auth_cleanup(),public.hb_claim_auth_cleanup(uuid,text[]) from public,anon,authenticated;
grant execute on function public.hb_social_auth(uuid,text,text,text,uuid,text),public.hb_claim_auth_cleanup(uuid,text[]) to service_role;
commit;
