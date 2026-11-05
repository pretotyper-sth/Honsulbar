begin;
alter table public.hb_login_identities drop constraint if exists hb_login_identities_provider_check;
alter table public.hb_login_identities add constraint hb_login_identities_provider_check check(provider in('toss','google','kakao','play-review'));
create or replace function public.hb_prepare_play_review(p_auth uuid,p_email text) returns uuid
language plpgsql security definer set search_path=public as $$
declare aid uuid:=p_auth; mid uuid; subject text;
begin
 perform pg_advisory_xact_lock(hashtextextended('auth-cleanup:'||aid,0));
 if not exists(select 1 from auth.users where id=aid and lower(email)=lower(p_email) and email_confirmed_at is not null and not coalesce(is_anonymous,false)) then raise exception 'Confirmed dedicated review Auth account required'; end if;
 if aid is null or p_email is null or length(p_email)>254 then raise exception 'Dedicated review account required'; end if;
 if exists(select 1 from hb_auth_cleanup where auth_user_id=aid and status in('deleting','done')) then raise exception 'Review Auth account is being deleted'; end if;
 if exists(select 1 from hb_login_identities where auth_user_id=aid and provider<>'play-review') then raise exception 'Existing personal identity cannot be used for review'; end if;
 insert into public.hb_members(toss_key,nickname,adult,photo_checked,balance,signup_platform,signup_provider)
 values('play-review:'||aid,'Review account',false,false,0,'android','play-review') on conflict(toss_key) do nothing;
 select id into mid from hb_members where toss_key='play-review:'||aid for update;
 if exists(select 1 from hb_login_identities where auth_user_id=aid and member_id<>mid) then raise exception 'Review Auth account belongs to another member'; end if;
 subject:=encode(sha256(convert_to('play-review:'||aid,'UTF8')),'hex');
 if exists(select 1 from hb_login_identities where provider='play-review' and subject_hash=subject and (member_id<>mid or auth_user_id is distinct from aid)) then raise exception 'Review identity ownership conflict'; end if;
 insert into hb_login_identities(provider,subject_hash,member_id,auth_user_id) values('play-review',subject,mid,aid) on conflict(provider,subject_hash) do nothing;
 return mid;
end $$;
revoke all on function public.hb_prepare_play_review(uuid,text) from public,anon,authenticated;
grant execute on function public.hb_prepare_play_review(uuid,text) to service_role;
commit;
