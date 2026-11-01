begin;
alter table public.hb_visits add column if not exists safety_remaining integer;
alter table public.hb_members add column if not exists identity_key text;
alter table public.hb_members add column if not exists photo_version bigint not null default (floor(extract(epoch from clock_timestamp())*1000)::bigint);
do $$ begin if to_regclass('public.hb_safety_ops') is null then update public.hb_members set photo_checked=false;update public.hb_visits set away=true,seat=null,speaker=false,mic=false,expires_at=case when seat=11 and not coalesce(away,false) then now()+make_interval(secs=>coalesce(held,0)) else expires_at end,held=null;end if;end $$;
create table if not exists public.hb_blocks (
 member_id uuid not null references public.hb_members(id) on delete cascade,
 target_id uuid not null references public.hb_members(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(member_id,target_id),check(member_id<>target_id)
);
create index if not exists hb_blocks_target on public.hb_blocks(target_id,member_id);
create table if not exists public.hb_photo_checks (
 token_hash text primary key,member_id uuid not null references public.hb_members(id) on delete cascade,
 photo_digest text not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes'
);
create table if not exists public.hb_photo_challenges (
 id uuid primary key default gen_random_uuid(),member_id uuid not null references public.hb_members(id) on delete cascade,
 motion text not null check(motion in('near','far')),created_at timestamptz not null default now(),used_at timestamptz
);
create table if not exists public.hb_photo_access (
 member_id uuid not null references public.hb_members(id) on delete cascade,target_id uuid not null references public.hb_members(id) on delete cascade,
 expires_at timestamptz not null,primary key(member_id,target_id)
);
create table if not exists public.hb_restrictions (
 identity_key text primary key,blocked_until timestamptz not null,delete_after timestamptz not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.hb_safety_ops (
 id boolean primary key default true check(id),reviewed_at timestamptz not null default now(),reviewed_by text not null default 'migration'
);
insert into public.hb_safety_ops(id) values(true) on conflict do nothing;
create or replace function public.hb_pair_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from hb_blocks where (member_id=a and target_id=b) or (member_id=b and target_id=a))
 or exists(select 1 from hb_tickets where kind='report' and ((member_id=a and target_id=b) or (member_id=b and target_id=a)));
$$;
create or replace function public.hb_room_blocked(p_member uuid,p_room uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from hb_visits where room_id=p_room and member_id<>p_member and hb_pair_blocked(p_member,member_id));
$$;
create or replace function public.hb_safety_paused() returns boolean language sql stable security definer set search_path=public as $$
 select (select reviewed_at<now()-interval '24 hours' from hb_safety_ops where id)
 or exists(select 1 from hb_tickets where kind='report' and status in('pending','reviewing') and created_at<now()-interval '18 hours');
$$;
create or replace function public.hb_seconds(v hb_visits) returns integer language sql stable as $$
 select case when v.safety_remaining is not null then v.safety_remaining when v.seat=11 and not coalesce(v.away,false) then coalesce(v.held,0) else greatest(0,ceil(extract(epoch from v.expires_at-now())))::integer end;
$$;
create or replace function public.hb_sync_safety_time() returns void language plpgsql security definer set search_path=public as $$
declare cutoff timestamptz;begin
 perform pg_advisory_xact_lock(73124);
 select min(t) into cutoff from (
  select reviewed_at+interval '24 hours' t from hb_safety_ops where id and reviewed_at<now()-interval '24 hours'
  union all select created_at+interval '18 hours' from hb_tickets where kind='report' and status in('pending','reviewing') and created_at<now()-interval '18 hours'
 ) deadlines;
 if cutoff is not null then
  update hb_visits set safety_remaining=case when seat=11 and not coalesce(away,false) then coalesce(held,0) else greatest(0,ceil(extract(epoch from expires_at-cutoff)))::integer end,
   away=true,seat=null,speaker=false,mic=false,held=null,expires_at='infinity'::timestamptz where safety_remaining is null;
  delete from hb_focus;
  update hb_requests set status='cancelled' where status='pending';
  delete from hb_signals;
 else
  update hb_visits set expires_at=now()+make_interval(secs=>safety_remaining),safety_remaining=null where safety_remaining is not null;
 end if;
end $$;
create or replace function public.hb_ops_ping(p_email text) returns void language sql security definer set search_path=public as $$
 update hb_safety_ops set reviewed_at=now(),reviewed_by=p_email where id;
$$;
create or replace function public.hb_new_photo_challenge(p_member uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare challenge hb_photo_challenges;begin
 perform pg_advisory_xact_lock(hashtext(p_member::text));
 if not exists(select 1 from hb_members where id=p_member and adult and (banned_until is null or banned_until<=now())) then raise exception '로그인이 필요해요.';end if;
 if (select count(*) from hb_photo_challenges where member_id=p_member and created_at>now()-interval '1 hour')>=6 then raise exception '얼굴 확인 시도가 많아요. 잠시 후 다시 시도해 주세요.';end if;
 insert into hb_photo_challenges(member_id,motion) values(p_member,case when random()<0.5 then 'near' else 'far' end) returning * into challenge;
 return jsonb_build_object('id',challenge.id,'motion',challenge.motion);
end $$;
create or replace function public.hb_use_photo_challenge(p_member uuid,p_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare motion_value text;begin
 update hb_photo_challenges set used_at=now() where id=p_id and member_id=p_member and used_at is null and created_at>now()-interval '3 minutes' returning motion into motion_value;
 if motion_value is null then raise exception '얼굴 확인을 다시 시작해 주세요.';end if;
 return motion_value;
end $$;
create or replace function public.hb_photo_version_update() returns trigger language plpgsql set search_path=public as $$
begin
 if new.photo is distinct from old.photo then new.photo_version=greatest(old.photo_version+1,floor(extract(epoch from clock_timestamp())*1000)::bigint);end if;
 return new;
end $$;
drop trigger if exists hb_photo_version_update on public.hb_members;
create trigger hb_photo_version_update before update on public.hb_members for each row execute function public.hb_photo_version_update();
create or replace function public.hb_can_view_photo(p_viewer uuid,p_target uuid,p_version bigint) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from hb_members viewer join hb_members target on target.id=p_target where viewer.id=p_viewer
 and (viewer.banned_until is null or viewer.banned_until<=now()) and target.photo_version=p_version
 and exists(select 1 from hb_sessions where member_id=p_viewer and expires_at>now())
 and (p_viewer=p_target or (target.photo_checked and not hb_pair_blocked(p_viewer,p_target) and (
 exists(select 1 from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=p_viewer and b.member_id=p_target and not a.away and not b.away)
 or exists(select 1 from hb_photo_access where member_id=p_viewer and target_id=p_target and expires_at>now())))));
$$;
create or replace function public.hb_action_before_safety(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare m hb_members; v hb_visits; other hb_visits; target uuid; rid uuid; ticket uuid; q hb_requests; cost integer; mins integer; s integer; drink text; daykey text; result jsonb; n integer; subscribed boolean;
begin
 perform pg_advisory_xact_lock(73124);
 select * into m from hb_members where id=p_member for update;
 if m.id is null then raise exception '로그인이 필요해요.'; end if;
 if m.banned_until>now() then raise exception '이용이 제한된 계정이에요. 고객센터에 문의해 주세요.'; end if;
 perform hb_cleanup();
 select * into v from hb_visits where member_id=p_member;
 subscribed=coalesce(m.sub_access,false) and (m.sub_expires_at is null or m.sub_expires_at>now());
 daykey=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD');
 if p_action='profile' then
 if length(trim(p_data->>'nickname')) not between 2 and 16 or (p_data->>'nickname') !~ '^[가-힣a-zA-Z0-9 ]+$' or (p_data->>'nickname') ~* '(관리자|운영자|혼술바|토스|고객센터|섹스|조건만남)' then raise exception '닉네임을 확인해 주세요.'; end if;
 if coalesce(p_data->>'gender','') not in ('male','female') then raise exception '성별을 선택해 주세요.'; end if;
 if p_data ? 'photo' and coalesce((p_data->>'photoChecked')::boolean,false)=false then raise exception '변경한 사진을 먼저 확인해 주세요.'; end if;
 if not (p_data ? 'photo') and m.photo is null then raise exception '프로필 사진을 등록해 주세요.'; end if;
 update hb_members set nickname=trim(p_data->>'nickname'),gender=p_data->>'gender',
  photo=case when p_data ? 'photo' then p_data->>'photo' else photo end,
  photo_checked=case when p_data ? 'photo' then true else photo_checked end,updated_at=now() where id=p_member;
 elsif p_action='ticket' then
 if length(trim(coalesce(p_data->>'message',''))) not between 1 and 2000 then raise exception '문의 내용을 입력해 주세요.'; end if;
 if (select count(*) from hb_tickets where member_id=p_member and created_at>now()-interval '1 hour')>=10 then raise exception '잠시 후 다시 접수해 주세요.'; end if;
 insert into hb_tickets(member_id,kind,category,message,target_id) values(p_member,coalesce(p_data->>'kind','inquiry'),left(coalesce(p_data->>'category','기타 문의'),40),trim(p_data->>'message'),nullif(p_data->>'targetId','')::uuid) returning id into ticket;
 insert into hb_outbox(kind,data,dedupe) values('email',jsonb_build_object('ticketId',ticket,'category',p_data->>'category'),'ticket:'||ticket);
 return jsonb_build_object('id',ticket);
 elsif p_action='read' then
 update hb_notifications set read_at=now() where member_id=p_member and read_at is null and (nullif(p_data->>'id','') is null or id=(p_data->>'id')::uuid);
 elsif p_action='region' then
 if length(trim(coalesce(p_data->>'region',''))) not between 1 and 30 then raise exception '지역을 입력해 주세요.'; end if;
 insert into hb_regions(member_id,region) values(p_member,trim(p_data->>'region')) on conflict do nothing;
 elsif p_action='waitlist' then
 select id into rid from hb_rooms where region=p_data->>'region' and number=(p_data->>'number')::integer;
 if rid is null then raise exception '호점을 찾을 수 없어요.'; end if;
 insert into hb_waitlist(member_id,room_id) values(p_member,rid) on conflict do nothing;
 elsif p_action='enter' then
 if not m.adult or not m.photo_checked or m.photo is null then raise exception '성인 확인과 프로필 사진 확인이 필요해요.'; end if;
 select id into rid from hb_rooms where region=p_data->>'region' and number=(p_data->>'number')::integer;
 if rid is null then raise exception '호점을 찾을 수 없어요.'; end if;
 if v.id is not null and not coalesce(v.away,false) then raise exception '이미 입장한 호점이 있어요.'; end if;
 if v.id is not null and coalesce(v.away,false) and v.room_id=rid and hb_seconds(v)>0 then
  select i into s from generate_series(0,11) i where not exists(select 1 from hb_visits where room_id=rid and seat=i) order by i limit 1;
  if s is null then raise exception '자리가 모두 찼어요.'; end if;
  update hb_visits set away=false,seat=s,speaker=false,mic=false,heartbeat_at=now() where member_id=p_member;
  return '{}';
 end if;
 drink=p_data->>'drinkId';
 if drink not in ('highball','wine','wine-hour','beer','whiskey','cocktail','citrus') then raise exception '음료를 선택해 주세요.'; end if;
 cost=case when drink='wine-hour' then 1000 else 500 end; mins=case when drink='wine-hour' then 60 else 30 end;
 if not subscribed and m.balance<cost then raise exception '포인트가 부족해요.'; end if;
 if v.id is not null then delete from hb_visits where member_id=p_member; end if;
 select i into s from generate_series(0,11) i where not exists(select 1 from hb_visits where room_id=rid and seat=i) order by i limit 1;
 if s is null then raise exception '자리가 모두 찼어요.'; end if;
 insert into hb_visits(member_id,room_id,seat,drink_id,expires_at,held,away) values(p_member,rid,s,drink,case when s=11 then 'infinity'::timestamptz else now()+make_interval(mins=>mins) end,case when s=11 then mins*60 end,false);
 if (select count(*) from hb_visits where room_id=rid and not coalesce(away,false))=12 then
 insert into hb_rooms(region,number) select region,max(number)+1 from hb_rooms where region=p_data->>'region' group by region on conflict do nothing;
 end if;
 if subscribed then
 insert into hb_ledger(member_id,label,amount) values(p_member,'음료 선택 · 입장',0);
 else
 update hb_members set balance=balance-cost where id=p_member;
 insert into hb_ledger(member_id,label,amount) values(p_member,'음료 선택 · 입장',-cost);
 end if;
 elsif p_action='order' then
 if not m.adult or not m.photo_checked or m.photo is null then raise exception '성인 확인과 프로필 사진 확인이 필요해요.'; end if;
 if v.id is null or coalesce(v.away,false) then raise exception '먼저 입장해 주세요.'; end if;
 drink=p_data->>'drinkId';
 if drink not in ('highball','wine','wine-hour','beer','whiskey','cocktail','citrus') then raise exception '음료를 선택해 주세요.'; end if;
 cost=case when drink='wine-hour' then 1000 else 500 end; mins=case when drink='wine-hour' then 60 else 30 end;
 if not subscribed and m.balance<cost then raise exception '포인트가 부족해요.'; end if;
 if v.seat=11 then update hb_visits set drink_id=drink,held=coalesce(held,0)+mins*60 where member_id=p_member;
 else update hb_visits set drink_id=drink,expires_at=greatest(expires_at,now())+make_interval(mins=>mins) where member_id=p_member; end if;
 if subscribed then
 insert into hb_ledger(member_id,label,amount) values(p_member,'음료 주문 · 연장',0);
 else
 update hb_members set balance=balance-cost where id=p_member;
 insert into hb_ledger(member_id,label,amount) values(p_member,'음료 주문 · 연장',-cost);
 end if;
 elsif p_action='leave' then
 if v.id is not null and not coalesce(v.away,false) then
  if hb_seconds(v)<=0 then
   delete from hb_visits where member_id=p_member;
  elsif v.seat=11 then
   update hb_visits set away=true,seat=null,speaker=false,mic=false,held=null,expires_at=now()+make_interval(secs=>greatest(0,coalesce(v.held,0))) where member_id=p_member;
  else
   update hb_visits set away=true,seat=null,speaker=false,mic=false where member_id=p_member;
  end if;
 end if;
 delete from hb_focus where member_id=p_member or partner_id=p_member;
 update hb_requests set status='cancelled' where status='pending' and (sender=p_member or receiver=p_member);
 perform hb_cleanup();
 elsif p_action='heartbeat' then
 update hb_visits set heartbeat_at=now(),speaker=coalesce((p_data->>'speaker')::boolean,false),mic=coalesce((p_data->>'mic')::boolean,false) where member_id=p_member and not coalesce(away,false);
 elsif p_action='move' then
 s=(p_data->>'seat')::integer;
 if v.id is null or coalesce(v.away,false) or s not between 0 and 11 then raise exception '이동할 자리를 확인해 주세요.'; end if;
 if exists(select 1 from hb_visits where room_id=v.room_id and seat=s and member_id<>p_member) then raise exception '다른 손님이 먼저 앉았어요.'; end if;
 if s<>11 and hb_seconds(v)=0 then raise exception '이용시간이 끝났어요. 한 잔 더 주문해 주세요.'; end if;
 perform hb_seat_update(p_member,s,hb_seconds(v));
 delete from hb_focus where member_id=p_member or partner_id=p_member;
 update hb_requests set status='cancelled' where status='pending' and (sender=p_member or receiver=p_member);
 elsif p_action='request' then
 target=(p_data->>'targetId')::uuid; select * into other from hb_visits where member_id=target;
 if v.id is null or coalesce(v.away,false) or other.id is null or coalesce(other.away,false) or v.room_id<>other.room_id or target=p_member then raise exception '같은 호점의 손님에게만 요청할 수 있어요.'; end if;
 if p_data->>'kind'='swap' then
 if m.balance<500 then raise exception '500P가 필요해요.'; end if;
 if exists(select 1 from hb_requests where sender=p_member and receiver=target and receiver_seat=other.seat and kind='swap') then raise exception '같은 사람의 같은 자리에는 한 번만 부탁할 수 있어요.'; end if;
 if (select count(*) from hb_requests where sender=p_member and kind='swap' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=5 then raise exception '오늘의 자리 요청을 모두 사용했어요.'; end if;
 elsif p_data->>'kind'='focus' then
 if v.seat=11 or other.seat=11 or abs(v.seat-other.seat)<>1 then raise exception '바로 옆자리에서만 대화할 수 있어요.'; end if;
 elsif p_data->>'kind'<>'wave' then raise exception '잘못된 요청이에요.';
 end if;
 if exists(select 1 from hb_requests where sender=p_member and created_at>now()-interval '10 seconds') then raise exception '잠시 후 다시 요청해 주세요.'; end if;
 insert into hb_requests(sender,receiver,room_id,kind,sender_seat,receiver_seat) values(p_member,target,v.room_id,p_data->>'kind',v.seat,other.seat) returning id into rid;
 if p_data->>'kind'='wave' then perform hb_notify(target,'wave',m.nickname||'님이 손을 흔들었어요','같은 호점에서 인사해 보세요.',jsonb_build_object('senderId',p_member)); end if;
 return jsonb_build_object('id',rid);
 elsif p_action='respond' then
 select * into q from hb_requests where id=(p_data->>'id')::uuid for update;
 if q.receiver<>p_member or q.id is null then raise exception '요청을 찾을 수 없어요.'; end if;
 if q.status<>'pending' or q.expires_at<=now() then raise exception '이미 끝난 요청이에요.'; end if;
 if coalesce((p_data->>'accept')::boolean,false)=false then update hb_requests set status='declined' where id=q.id; return '{}'; end if;
 select * into other from hb_visits where member_id=q.sender;
 if v.id is null or coalesce(v.away,false) or other.id is null or coalesce(other.away,false) or v.room_id<>q.room_id or other.room_id<>q.room_id or v.seat<>q.receiver_seat or other.seat<>q.sender_seat then raise exception '자리가 바뀌어 요청이 취소됐어요.'; end if;
 if q.kind='swap' then
 if (select count(*) from hb_ledger where member_id=p_member and label='자리 양보 보상' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')>=3 then raise exception '오늘 받을 수 있는 자리 양보 보상을 모두 받았어요.'; end if;
 if exists(select 1 from hb_requests where sender=q.sender and receiver=p_member and kind='swap' and status='accepted' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') then raise exception '같은 손님에게서는 하루 한 번만 받을 수 있어요.'; end if;
 update hb_members set balance=balance-500 where id=q.sender and balance>=500;
 if not found then raise exception '요청자의 포인트가 부족해요.'; end if;
 update hb_members set balance=balance+500 where id=p_member;
 insert into hb_ledger(member_id,label,amount,reference) values(q.sender,'자리 양보 요청',-500,q.id||':send'),(p_member,'자리 양보 보상',500,q.id||':receive');
 update hb_visits set seat=case when member_id=p_member then other.seat else v.seat end,
  held=case when (case when member_id=p_member then other.seat else v.seat end)=11 then (case when member_id=p_member then hb_seconds(v) else hb_seconds(other) end) end,
  expires_at=case when (case when member_id=p_member then other.seat else v.seat end)=11 then 'infinity'::timestamptz else now()+make_interval(secs=>case when member_id=p_member then hb_seconds(v) else hb_seconds(other) end) end
  where member_id in (p_member,q.sender);
 delete from hb_focus where member_id in(p_member,q.sender) or partner_id in(p_member,q.sender);
 elsif q.kind='focus' then
 if exists(select 1 from hb_focus where member_id in(p_member,q.sender)) then raise exception '이미 다른 손님과 대화 중이에요.'; end if;
 insert into hb_focus values(p_member,q.sender),(q.sender,p_member);
 end if;
 update hb_requests set status='accepted' where id=q.id;
 elsif p_action='cancel' then
 update hb_requests set status='cancelled' where id=(p_data->>'id')::uuid and sender=p_member and status='pending';
 elsif p_action='focus-end' then
 delete from hb_focus where member_id=p_member or partner_id=p_member;
 elsif p_action='preview' then
 select id into rid from hb_rooms where region=p_data->>'region' and number=(p_data->>'number')::integer;
 if not exists(select 1 from hb_visits where room_id=rid and not coalesce(away,false)) then raise exception '아직 손님이 없어요.'; end if;
 if not subscribed and m.balance<500 then raise exception '500P가 필요해요.'; end if;
 if subscribed then
 insert into hb_ledger(member_id,label,amount) values(p_member,'손님 미리보기',0);
 else
 update hb_members set balance=balance-500 where id=p_member;
 insert into hb_ledger(member_id,label,amount) values(p_member,'손님 미리보기',-500);
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'nickname',u.nickname,'photo',case when u.photo is null then null else floor(extract(epoch from u.updated_at))::bigint end,'gender',u.gender,'seat',a.seat,'drinkId',a.drink_id)) from hb_visits a join hb_members u on u.id=a.member_id where a.room_id=rid and not coalesce(a.away,false)),'[]');
 elsif p_action='signal' then
 target=(p_data->>'targetId')::uuid;
 if v.id is null or coalesce(v.away,false) or not exists(select 1 from hb_visits where member_id=target and room_id=v.room_id and not coalesce(away,false)) then raise exception '음성 연결 대상이 없어요.'; end if;
 if octet_length((p_data->'signal')::text)>20000 then raise exception '잘못된 연결 정보예요.'; end if;
 insert into hb_signals(sender,receiver,data) values(p_member,target,p_data->'signal');
 elsif p_action='ad-start' then
 if exists(select 1 from hb_ledger where reference='attendance:'||p_member||':'||daykey) then raise exception '오늘의 출석 포인트를 이미 받았어요.'; end if;
 if (select count(*) from hb_ad_claims where member_id=p_member and created_at>now()-interval '1 hour')>=10 then raise exception '잠시 후 다시 시도해 주세요.'; end if;
 insert into hb_ad_claims(member_id) values(p_member) returning id into rid; return jsonb_build_object('id',rid);
 elsif p_action='ad-claim' then
 update hb_ad_claims set claimed_at=now() where id=(p_data->>'id')::uuid and member_id=p_member and claimed_at is null and created_at between now()-interval '10 minutes' and now()-interval '5 seconds';
 if not found then raise exception '광고 시청 정보를 확인할 수 없어요.'; end if;
 insert into hb_ledger(member_id,label,amount,reference) values(p_member,'광고 출석 포인트',1000,'attendance:'||p_member||':'||daykey) on conflict(reference) do nothing;
 if found then update hb_members set balance=balance+1000 where id=p_member; end if;
 elsif p_action='state' then null;
 else raise exception '지원하지 않는 요청이에요.';
 end if;
 return '{}';
end $$;

create or replace function public.hb_snapshot_before_safety(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=public as $$
declare v hb_visits; output jsonb; begin
 select * into v from hb_visits where member_id=p_member;
 select jsonb_build_object(
 'member',(select jsonb_build_object('id',id,'nickname',nickname,'gender',gender,'photo',case when photo is null then null else floor(extract(epoch from updated_at))::bigint end,'photoChecked',photo_checked,'adult',adult,'balance',balance,'subscribed',coalesce(sub_access,false) and (sub_expires_at is null or sub_expires_at>now()),'subAutoRenew',coalesce(sub_auto_renew,false),'subExpiresAt',sub_expires_at,'subOrderId',sub_order_id) from hb_members where id=p_member),
 'visit',case when v.id is null then null else jsonb_build_object('id',v.id,'seat',v.seat,'drinkId',v.drink_id,'seconds',hb_seconds(v),'speaker',v.speaker,'mic',coalesce(v.mic,false),'away',coalesce(v.away,false))||(select jsonb_build_object('region',region,'number',number) from hb_rooms where id=v.room_id) end,
 'waitlist',coalesce((select jsonb_agg(r.region||':'||r.number) from hb_waitlist w join hb_rooms r on r.id=w.room_id where w.member_id=p_member),'[]'),
 'swapRequestsToday',(select count(*) from hb_requests where sender=p_member and kind='swap' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'swapRewardsToday',(select count(*) from hb_ledger where member_id=p_member and label='자리 양보 보상' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'requestedSeats',coalesce((select jsonb_agg(distinct receiver||':'||receiver_seat) from hb_requests where sender=p_member and kind='swap'),'[]'),
 'rooms',coalesce((select jsonb_agg(x) from(select r.region,r.number,r.id,count(hv.member_id)::integer as count,coalesce(bool_or(hv.member_id in (select t.target_id from hb_tickets t where t.member_id=p_member and t.kind='report' and t.target_id is not null)),false) as "hasReportedGuest" from hb_rooms r left join hb_visits hv on hv.room_id=r.id and not coalesce(hv.away,false) group by r.id order by r.region,r.number)x),'[]'),
 'reportedIds',coalesce((select jsonb_agg(distinct target_id) from hb_tickets where member_id=p_member and kind='report' and target_id is not null),'[]'),
 'guests',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'nickname',m.nickname,'photo',case when m.photo is null then null else floor(extract(epoch from m.updated_at))::bigint end,'gender',m.gender,'seat',a.seat,'drinkId',a.drink_id,'seconds',hb_seconds(a),'speaker',a.speaker,'mic',coalesce(a.mic,false))) from hb_visits a join hb_members m on m.id=a.member_id where a.room_id=v.room_id and not coalesce(a.away,false) and m.id<>p_member),'[]'),
 'partners',coalesce((select jsonb_object_agg(member_id,partner_id) from hb_focus where member_id in(select member_id from hb_visits where room_id=v.room_id and not coalesce(away,false))),'{}'),
 'requests',coalesce((select jsonb_agg(r) from hb_requests r where (receiver=p_member or sender=p_member) and status='pending' and kind<>'wave'),'[]'),
 'notifications',coalesce((select jsonb_agg(x) from(select * from hb_notifications where member_id=p_member order by created_at desc limit 100)x),'[]'),
 'inquiries',coalesce((select jsonb_agg(x) from(select * from hb_tickets where member_id=p_member order by created_at desc limit 100)x),'[]'),
 'ledger',coalesce((select jsonb_agg(x) from(select * from hb_ledger where member_id=p_member order by created_at desc limit least(greatest(p_limit,10),100))x),'[]'),
 'ledgerCount',(select count(*) from hb_ledger where member_id=p_member),
 'attendanceDate',(select to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD') from hb_ledger where member_id=p_member and label='광고 출석 포인트' order by created_at desc limit 1),
 'signals',coalesce((select jsonb_agg(x) from(select id,sender,data from hb_signals where receiver=p_member and id>p_after and created_at>now()-interval '2 minutes' order by id limit 200)x),'[]')
 ) into output; return output;
end $$;

create or replace function public.hb_restrict_before_safety(p_member uuid,p_until timestamptz default null,p_kick boolean default true,p_reason text default '',p_set_ban boolean default true) returns void
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

create or replace function public.hb_retention_before_safety() returns void language plpgsql security definer set search_path=public as $$
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
create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare m hb_members;target uuid;rid uuid;v hb_visits;check_row hb_photo_checks;result jsonb;request_row hb_requests;begin
 perform pg_advisory_xact_lock(73124);
 select * into m from hb_members where id=p_member for update;
 if m.id is null then raise exception '로그인이 필요해요.';end if;
 if m.banned_until>now() then raise exception '이용이 제한된 계정이에요.';end if;
 if p_action in('enter','preview','request','respond','signal','waitlist','order','move') and (not m.adult or not m.photo_checked or m.photo is null) then raise exception '성인 확인과 프로필 사진 확인이 필요해요.';end if;
 if p_action in('enter','preview','order','signal','request','respond','move') and hb_safety_paused() then raise exception '안전 점검 중이에요. 잠시 후 다시 이용해 주세요.';end if;
 if p_action='profile' and p_data ? 'photo' and coalesce((p_data->>'photoChecked')::boolean,false)=false then raise exception '변경한 사진을 먼저 확인해 주세요.';end if;
 if p_action='profile' and regexp_replace(lower(coalesce(p_data->>'nickname','')),'[[:space:]]','','g') ~ '(조건|성매매|출장|만남알선|오피|스폰|텔레그램|카카오|카톡|라인아이디|입금|대출|투자|피싱|섹스|운영자|관리자|고객센터|토스)' then raise exception '사용할 수 없는 닉네임이에요.';end if;
 if p_action in('enter','preview','waitlist') then
  select id into rid from hb_rooms where region=p_data->>'region' and number=(p_data->>'number')::integer;
  if hb_room_blocked(p_member,rid) then raise exception '이용자 보호를 위해 현재 입장할 수 없는 바예요. 다른 바를 선택해 주세요.';end if;
 end if;
 if p_action in('request','signal','block') then
  target=nullif(p_data->>'targetId','')::uuid;
  if p_action<>'block' and hb_pair_blocked(p_member,target) then raise exception '이용자 보호를 위해 연결할 수 없어요.';end if;
 end if;
 if p_action='respond' then
  select * into request_row from hb_requests where id=(p_data->>'id')::uuid;
  if hb_pair_blocked(request_row.sender,request_row.receiver) then raise exception '이용자 보호를 위해 연결할 수 없어요.';end if;
 end if;
 if p_action in('ticket','block') then
  target=nullif(p_data->>'targetId','')::uuid;
  if target is not null and (p_action='block' or p_data->>'kind'='report') then
   if target=p_member or not exists(select 1 from hb_members where id=target) then raise exception '대상을 확인해 주세요.';end if;
   if not exists(select 1 from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=p_member and b.member_id=target and not a.away and not b.away) then raise exception '같은 바의 손님을 선택해 주세요.';end if;
  end if;
  if p_action='block' then
   insert into hb_blocks(member_id,target_id) values(p_member,target) on conflict do nothing;
   result='{}';
  else
   result=hb_action_before_safety(p_member,p_action,p_data);
   if p_data->>'kind'='report' then
    update hb_outbox set data=data||jsonb_build_object('urgent',coalesce(p_data->>'category','') ~ '(미성년|성매매|착취|협박|스토킹|개인정보|사기|피싱)') where dedupe='ticket:'||(result->>'id');
   end if;
  end if;
  if target is not null and (p_action='block' or p_data->>'kind'='report') then
   delete from hb_focus where (member_id=p_member and partner_id=target) or (member_id=target and partner_id=p_member);
   update hb_requests set status='cancelled' where status='pending' and ((sender=p_member and receiver=target) or (sender=target and receiver=p_member));
   delete from hb_signals where (sender=p_member and receiver=target) or (sender=target and receiver=p_member);
   delete from hb_photo_access where (member_id=p_member and target_id=target) or (member_id=target and target_id=p_member);
   delete from hb_waitlist where (member_id=p_member and room_id in(select room_id from hb_visits where member_id=target)) or (member_id=target and room_id in(select room_id from hb_visits where member_id=p_member));
  end if;
  return result;
 end if;
 result=hb_action_before_safety(p_member,p_action,p_data);
 if p_action='preview' then
  insert into hb_photo_access(member_id,target_id,expires_at) select p_member,member_id,now()+interval '5 minutes' from hb_visits where room_id=rid and not away
  on conflict(member_id,target_id) do update set expires_at=excluded.expires_at;
  result=(select coalesce(jsonb_agg(item||jsonb_build_object('photo',profile_member.photo_version)),'[]') from jsonb_array_elements(result) item join hb_members profile_member on profile_member.id=(item->>'id')::uuid);
 end if;
 return result;
end $$;
create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=public as $$
declare output jsonb;begin
 perform hb_sync_safety_time();
 output=hb_snapshot_before_safety(p_member,p_after,p_limit);
 output=jsonb_set(output,'{member,photo}',coalesce((select to_jsonb(photo_version) from hb_members where id=p_member and photo is not null),'null'));
 output=jsonb_set(output,'{rooms}',coalesce((select jsonb_agg(item||jsonb_build_object('hasReportedGuest',hb_room_blocked(p_member,(item->>'id')::uuid))) from jsonb_array_elements(output->'rooms') item),'[]'));
 output=jsonb_set(output,'{reportedIds}',coalesce((select jsonb_agg(id) from hb_members where id<>p_member and hb_pair_blocked(p_member,id)),'[]'));
 output=jsonb_set(output,'{guests}',coalesce((select jsonb_agg(item||jsonb_build_object('photo',case when hb_pair_blocked(p_member,m.id) then null else m.photo_version end)) from jsonb_array_elements(output->'guests') item join hb_members m on m.id=(item->>'id')::uuid),'[]'));
 output=jsonb_set(output,'{signals}',coalesce((select jsonb_agg(item) from jsonb_array_elements(output->'signals') item where not hb_pair_blocked(p_member,(item->>'sender')::uuid)),'[]'));
 output=output||jsonb_build_object('safetyPaused',hb_safety_paused());
 return output;
end $$;
create or replace function public.hb_restrict(p_member uuid,p_until timestamptz default null,p_kick boolean default true,p_reason text default '',p_set_ban boolean default true) returns void language plpgsql security definer set search_path=public as $$
declare key_value text;begin
 perform hb_restrict_before_safety(p_member,p_until,p_kick,p_reason,p_set_ban);
 select identity_key into key_value from hb_members where id=p_member;
 if p_set_ban and key_value is not null then
  if p_until is null then delete from hb_restrictions where identity_key=key_value;
  else insert into hb_restrictions(identity_key,blocked_until,delete_after) values(key_value,p_until,case when p_until>'9000-01-01' then now()+interval '3 years' else p_until+interval '1 year' end)
   on conflict(identity_key) do update set blocked_until=excluded.blocked_until,delete_after=excluded.delete_after,updated_at=now();end if;
 end if;
 if p_kick then delete from hb_sessions where member_id=p_member;end if;
end $$;
create or replace function public.hb_retention() returns void language plpgsql security definer set search_path=public as $$
begin
 perform hb_retention_before_safety();
 delete from hb_photo_checks where expires_at<now();
 delete from hb_photo_challenges where created_at<now()-interval '1 day';
 delete from hb_photo_access where expires_at<now();
 delete from hb_restrictions where delete_after<now();
end $$;
create or replace function public.hb_cleanup() returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
 perform hb_sync_safety_time();
 delete from hb_visits where safety_remaining is null and (
  (not coalesce(away,false) and (heartbeat_at<now()-interval '90 seconds' or expires_at<=now()-interval '3 minutes'))
  or (coalesce(away,false) and expires_at<=now()));
 delete from hb_focus f where not exists(select 1 from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=f.member_id and b.member_id=f.partner_id and not coalesce(a.away,false) and not coalesce(b.away,false) and a.seat<>11 and b.seat<>11 and abs(a.seat-b.seat)=1);
 update hb_requests set status='expired' where status='pending' and expires_at<now();
 for r in select w.member_id,w.room_id,v.region,v.number from hb_waitlist w join hb_rooms v on v.id=w.room_id where (select count(*) from hb_visits where room_id=w.room_id and not coalesce(away,false))<12 and not hb_room_blocked(w.member_id,w.room_id) for update of w skip locked loop
 perform hb_notify(r.member_id,'available',r.region||' '||r.number||'호점','빈자리가 생겼어요. 지금 입장할 수 있어요.',jsonb_build_object('region',r.region,'number',r.number));
 delete from hb_waitlist where member_id=r.member_id and room_id=r.room_id;
 end loop;
end $$;

do $$ declare t text;f record;begin
 foreach t in array array['hb_blocks','hb_photo_checks','hb_photo_challenges','hb_photo_access','hb_restrictions','hb_safety_ops'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hb_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
