begin;
alter table public.hb_tickets add column if not exists context jsonb not null default '{}';
alter table public.hb_visits add column if not exists mic boolean not null default false;

create table if not exists public.hb_events (
 name text not null check(length(name) between 1 and 40),
 member_id uuid,
 data jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index if not exists hb_events_created on hb_events(created_at desc);
create index if not exists hb_events_name_created on hb_events(name, created_at desc);

alter table public.hb_events enable row level security;
revoke all on public.hb_events from anon, authenticated;
grant all on public.hb_events to service_role;

create or replace function public.hb_log(p_name text, p_member uuid default null, p_data jsonb default '{}') returns void
language sql security definer set search_path=public as $$
 insert into hb_events(name,member_id,data) values(left(p_name,40),p_member,coalesce(p_data,'{}'));
$$;

create or replace function public.hb_set_mic(p_member uuid, p_mic boolean) returns void
language sql security definer set search_path=public as $$
 update hb_visits set mic=coalesce(p_mic,false) where member_id=p_member;
$$;

create or replace function public.hb_ticket_fill_context() returns trigger language plpgsql security definer set search_path=public as $$
declare reporter hb_visits; target_v hb_visits; room hb_rooms;
begin
 if new.kind<>'report' then return new; end if;
 select * into reporter from hb_visits where member_id=new.member_id;
 select * into target_v from hb_visits where member_id=new.target_id;
 select * into room from hb_rooms where id=coalesce(reporter.room_id,target_v.room_id);
 new.context=coalesce(new.context,'{}')||jsonb_build_object(
  'at',now(),
  'region',room.region,
  'number',room.number,
  'roomId',room.id,
  'reporterSeat',reporter.seat,
  'reporterDrink',reporter.drink_id,
  'targetSeat',target_v.seat,
  'targetDrink',target_v.drink_id,
  'sameRoom',reporter.room_id is not null and reporter.room_id is not distinct from target_v.room_id
 );
 return new;
end $$;
drop trigger if exists hb_ticket_fill_context on hb_tickets;
create trigger hb_ticket_fill_context before insert on hb_tickets for each row execute function hb_ticket_fill_context();

create or replace function public.hb_events_from_ticket() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform hb_log(case when new.kind='report' then 'report' else 'ticket' end,new.member_id,jsonb_build_object('kind',new.kind,'category',new.category));
 return new;
end $$;
drop trigger if exists hb_events_from_ticket on hb_tickets;
create trigger hb_events_from_ticket after insert on hb_tickets for each row execute function hb_events_from_ticket();

create or replace function public.hb_events_from_visit() returns trigger language plpgsql security definer set search_path=public as $$
declare room hb_rooms;
begin
 if tg_op='INSERT' then
  select * into room from hb_rooms where id=new.room_id;
  perform hb_log('enter',new.member_id,jsonb_build_object('region',room.region,'number',room.number,'drinkId',new.drink_id));
  return new;
 end if;
 select * into room from hb_rooms where id=old.room_id;
 perform hb_log('leave',old.member_id,jsonb_build_object('region',room.region,'number',room.number));
 return old;
end $$;
drop trigger if exists hb_events_from_visit on hb_visits;
create trigger hb_events_from_visit after insert or delete on hb_visits for each row execute function hb_events_from_visit();

create or replace function public.hb_events_from_waitlist() returns trigger language plpgsql security definer set search_path=public as $$
declare room hb_rooms;
begin
 select * into room from hb_rooms where id=new.room_id;
 perform hb_log('waitlist',new.member_id,jsonb_build_object('region',room.region,'number',room.number));
 return new;
end $$;
drop trigger if exists hb_events_from_waitlist on hb_waitlist;
create trigger hb_events_from_waitlist after insert on hb_waitlist for each row execute function hb_events_from_waitlist();

create or replace function public.hb_events_from_ad() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.claimed_at is not null and old.claimed_at is null then
  perform hb_log('ad-claim',new.member_id,'{}');
 end if;
 return new;
end $$;
drop trigger if exists hb_events_from_ad on hb_ad_claims;
create trigger hb_events_from_ad after update on hb_ad_claims for each row execute function hb_events_from_ad();

create or replace function public.hb_restrict(p_member uuid,p_until timestamptz default null,p_kick boolean default true,p_reason text default '',p_set_ban boolean default true) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_member is null then raise exception '회원을 확인해 주세요.'; end if;
 if not exists(select 1 from hb_members where id=p_member) then raise exception '회원을 찾을 수 없어요.'; end if;
 if coalesce(p_set_ban,true) then
  update hb_members set banned_until=p_until,updated_at=now() where id=p_member;
 end if;
 if coalesce(p_kick,false) then
  delete from hb_visits where member_id=p_member;
  delete from hb_focus where member_id=p_member or partner_id=p_member;
  delete from hb_requests where (sender=p_member or receiver=p_member) and status='pending';
 end if;
 perform hb_log('restrict',p_member,jsonb_build_object('until',p_until,'kick',coalesce(p_kick,false),'setBan',coalesce(p_set_ban,true),'reason',left(coalesce(p_reason,''),80)));
end $$;

create or replace function public.hb_admin_stats() returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object(
  'openReports',(select count(*)::int from hb_tickets where kind='report' and status in('pending','reviewing')),
  'openInquiries',(select count(*)::int from hb_tickets where kind='inquiry' and status in('pending','reviewing')),
  'overdue',(select count(*)::int from hb_tickets where status in('pending','reviewing') and created_at<now()-interval '24 hours'),
  'banned',(select count(*)::int from hb_members where banned_until>now()),
  'day',coalesce((select jsonb_object_agg(name,n) from(select name,count(*)::int n from hb_events where created_at>now()-interval '24 hours' group by name)s),'{}')
 );
$$;

create or replace function public.hb_login(p_key text) returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid; begin
 select id into mid from hb_members where toss_key=p_key;
 if mid is not null then perform hb_log('login',mid,'{}'); return mid; end if;
 insert into hb_members(toss_key,adult) values(p_key,true) on conflict(toss_key) do nothing returning id into mid;
 if mid is null then select id into mid from hb_members where toss_key=p_key; perform hb_log('login',mid,'{}'); return mid; end if;
 insert into hb_bonus_claims(key_hash) values(encode(sha256(convert_to('hb:'||p_key,'UTF8')),'hex')) on conflict do nothing;
 if found then
  update hb_members set balance=balance+2000 where id=mid;
  insert into hb_ledger(member_id,label,amount,reference) values(mid,'가입 축하 포인트',2000,'welcome:'||mid);
 end if;
 perform hb_log('signup',mid,'{}');
 return mid;
end $$;

create or replace function public.hb_credit_order(p_member uuid,p_order text,p_sku text,p_points integer,p_amount integer) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(73124);
 if p_points<=0 or p_amount<=0 then raise exception 'Invalid purchase'; end if;
 if exists(select 1 from hb_orders where order_id=p_order and member_id is distinct from p_member) then raise exception 'Order owner mismatch'; end if;
 insert into hb_orders(order_id,member_id,sku,points,amount) values(p_order,p_member,p_sku,p_points,p_amount) on conflict do nothing;
 if found then
 update hb_members set balance=balance+p_points where id=p_member;
 insert into hb_ledger(member_id,label,amount,reference) values(p_member,'포인트 충전',p_points,'order:'||p_order);
 perform hb_log('purchase',p_member,jsonb_build_object('sku',p_sku,'points',p_points,'amount',p_amount));
 end if;
end $$;

create or replace function public.hb_apply_subscription(p_member uuid,p_order text,p_sku text,p_access boolean,p_auto_renew boolean,p_expires timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare mid uuid;
begin
 perform pg_advisory_xact_lock(73125);
 if p_order is null or length(p_order) not between 8 and 80 then raise exception '구독 정보를 확인해 주세요.'; end if;
 mid:=p_member;
 if mid is null then select id into mid from hb_members where sub_order_id=p_order; end if;
 if mid is null then select member_id into mid from hb_orders where order_id=p_order; end if;
 insert into hb_orders(order_id,member_id,sku,points,amount) values(p_order,mid,coalesce(nullif(p_sku,''),'honsulbar_sub_monthly'),0,13200)
  on conflict(order_id) do update set member_id=coalesce(hb_orders.member_id,excluded.member_id),sku=excluded.sku;
 if mid is null then return; end if;
 update hb_members set sub_sku=coalesce(nullif(p_sku,''),sub_sku,'honsulbar_sub_monthly'),sub_order_id=p_order,sub_access=coalesce(p_access,false),sub_auto_renew=coalesce(p_auto_renew,false),sub_expires_at=p_expires,updated_at=now() where id=mid;
 if coalesce(p_access,false) then
  insert into hb_ledger(member_id,label,amount,reference) values(mid,'월간 구독',0,'sub:'||p_order) on conflict(reference) do nothing;
 end if;
 perform hb_log('subscribe',mid,jsonb_build_object('sku',coalesce(nullif(p_sku,''),'honsulbar_sub_monthly'),'access',coalesce(p_access,false),'autoRenew',coalesce(p_auto_renew,false)));
end $$;

create or replace function public.hb_retention() returns void language plpgsql security definer set search_path=public as $$
begin
 perform hb_cleanup();
 delete from hb_sessions where expires_at<now();
 delete from hb_signals where created_at<now()-interval '2 minutes';
 delete from hb_ad_claims where created_at<now()-interval '1 day';
 delete from hb_notifications where created_at<now()-interval '90 days';
 delete from hb_events where created_at<now()-interval '90 days';
 delete from hb_requests where created_at<now()-interval '1 year';
 delete from hb_tickets where updated_at<now()-interval '3 years' and status in('answered','closed');
 delete from hb_ledger where created_at<now()-interval '5 years';
 delete from hb_orders where created_at<now()-interval '5 years';
 delete from hb_outbox where sent_at<now()-interval '30 days';
 delete from hb_waitlist where created_at<now()-interval '7 days';
 delete from hb_regions where created_at<now()-interval '1 year';
end $$;

create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=public as $$
declare v hb_visits; output jsonb; begin
 select * into v from hb_visits where member_id=p_member;
 select jsonb_build_object(
 'member',(select jsonb_build_object('id',id,'nickname',nickname,'gender',gender,'photo',case when photo is null then null else floor(extract(epoch from updated_at))::bigint end,'photoChecked',photo_checked,'adult',adult,'balance',balance,'subscribed',coalesce(sub_access,false) and (sub_expires_at is null or sub_expires_at>now()),'subAutoRenew',coalesce(sub_auto_renew,false),'subExpiresAt',sub_expires_at,'subOrderId',sub_order_id) from hb_members where id=p_member),
 'visit',case when v.id is null then null else jsonb_build_object('id',v.id,'seat',v.seat,'drinkId',v.drink_id,'seconds',hb_seconds(v),'speaker',v.speaker,'mic',coalesce(v.mic,false))||(select jsonb_build_object('region',region,'number',number) from hb_rooms where id=v.room_id) end,
 'waitlist',coalesce((select jsonb_agg(r.region||':'||r.number) from hb_waitlist w join hb_rooms r on r.id=w.room_id where w.member_id=p_member),'[]'),
 'swapRequestsToday',(select count(*) from hb_requests where sender=p_member and kind='swap' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'swapRewardsToday',(select count(*) from hb_ledger where member_id=p_member and label='자리 양보 보상' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'requestedSeats',coalesce((select jsonb_agg(distinct receiver||':'||receiver_seat) from hb_requests where sender=p_member and kind='swap'),'[]'),
 'rooms',coalesce((select jsonb_agg(x) from(select r.region,r.number,r.id,count(hv.member_id)::integer as count,coalesce(bool_or(hv.member_id in (select t.target_id from hb_tickets t where t.member_id=p_member and t.kind='report' and t.target_id is not null)),false) as "hasReportedGuest" from hb_rooms r left join hb_visits hv on hv.room_id=r.id group by r.id order by r.region,r.number)x),'[]'),
 'reportedIds',coalesce((select jsonb_agg(distinct target_id) from hb_tickets where member_id=p_member and kind='report' and target_id is not null),'[]'),
 'guests',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'nickname',m.nickname,'photo',case when m.photo is null then null else floor(extract(epoch from m.updated_at))::bigint end,'gender',m.gender,'seat',a.seat,'drinkId',a.drink_id,'seconds',hb_seconds(a),'speaker',a.speaker,'mic',coalesce(a.mic,false))) from hb_visits a join hb_members m on m.id=a.member_id where a.room_id=v.room_id and m.id<>p_member),'[]'),
 'partners',coalesce((select jsonb_object_agg(member_id,partner_id) from hb_focus where member_id in(select member_id from hb_visits where room_id=v.room_id)),'{}'),
 'requests',coalesce((select jsonb_agg(r) from hb_requests r where (receiver=p_member or sender=p_member) and status='pending' and kind<>'wave'),'[]'),
 'notifications',coalesce((select jsonb_agg(x) from(select * from hb_notifications where member_id=p_member order by created_at desc limit 100)x),'[]'),
 'inquiries',coalesce((select jsonb_agg(x) from(select * from hb_tickets where member_id=p_member order by created_at desc limit 100)x),'[]'),
 'ledger',coalesce((select jsonb_agg(x) from(select * from hb_ledger where member_id=p_member order by created_at desc limit least(greatest(p_limit,10),100))x),'[]'),
 'ledgerCount',(select count(*) from hb_ledger where member_id=p_member),
 'attendanceDate',(select to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD') from hb_ledger where member_id=p_member and label='광고 출석 포인트' order by created_at desc limit 1),
 'signals',coalesce((select jsonb_agg(x) from(select id,sender,data from hb_signals where receiver=p_member and id>p_after and created_at>now()-interval '2 minutes' order by id limit 200)x),'[]')
 ) into output; return output;
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('hb_log','hb_set_mic','hb_restrict','hb_admin_stats','hb_ticket_fill_context','hb_events_from_ticket','hb_events_from_visit','hb_events_from_waitlist','hb_events_from_ad','hb_login','hb_credit_order','hb_apply_subscription','hb_retention','hb_snapshot') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
