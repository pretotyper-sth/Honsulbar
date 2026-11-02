begin;
alter table public.hb_sessions add column if not exists platform text not null default 'toss';
update public.hb_sessions set platform='android' where member_id in (select id from public.hb_members where toss_key like 'social:%');
create table if not exists public.hb_android_ad_claims (
 id uuid primary key references public.hb_ad_claims(id) on delete cascade,
 mode text not null check(mode in ('test','live')),
 ad_unit text not null,
 transaction_id text unique,
 verified_at timestamptz
);
alter table public.hb_android_ad_claims enable row level security;
revoke all on public.hb_android_ad_claims from public,anon,authenticated;
grant all on public.hb_android_ad_claims to service_role;

create or replace function public.hb_start_android_ad(p_member uuid,p_mode text,p_unit text) returns uuid
language plpgsql security definer set search_path=public as $$
declare claim uuid; result jsonb; begin
 if p_mode not in ('test','live') or p_unit !~ '^[0-9]+$' then raise exception 'Invalid ad configuration'; end if;
 result:=hb_action(p_member,'ad-start','{}');
 claim:=(result->>'id')::uuid;
 insert into hb_android_ad_claims(id,mode,ad_unit) values(claim,p_mode,p_unit);
 return claim;
end $$;

create or replace function public.hb_complete_android_ad(p_claim uuid,p_unit text,p_transaction text,p_timestamp bigint,p_test boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare a hb_android_ad_claims; c hb_ad_claims; daykey text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'); begin
 select * into a from hb_android_ad_claims where id=p_claim for update;
 if a.id is null or a.ad_unit<>p_unit or (p_test and a.mode<>'test') or (not p_test and a.mode<>'live') then raise exception 'Invalid reward claim'; end if;
 if a.verified_at is not null then return true; end if;
 select * into c from hb_ad_claims where id=p_claim for update;
 if c.id is null or c.created_at<now()-interval '1 day' or p_timestamp<extract(epoch from c.created_at-interval '1 minute')*1000 or p_timestamp>extract(epoch from now()+interval '1 minute')*1000 then raise exception 'Expired reward claim'; end if;
 if not p_test and (p_transaction is null or p_transaction !~ '^[a-fA-F0-9]{8,128}$') then raise exception 'Invalid reward transaction'; end if;
 update hb_android_ad_claims set transaction_id=p_transaction,verified_at=now() where id=p_claim;
 update hb_ad_claims set claimed_at=now() where id=p_claim;
 insert into hb_ledger(member_id,label,amount,reference) values(c.member_id,case when p_test then '테스트 광고 출석' else '광고 출석 포인트' end,1000,'attendance:'||c.member_id||':'||daykey) on conflict(reference) do nothing;
 if found then update hb_members set balance=balance+1000 where id=c.member_id; end if;
 return true;
end $$;
revoke all on function public.hb_start_android_ad(uuid,text,text),public.hb_complete_android_ad(uuid,text,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.hb_start_android_ad(uuid,text,text),public.hb_complete_android_ad(uuid,text,text,bigint,boolean) to service_role;
commit;
