begin;
alter table public.hb_members add column if not exists sub_sku text;
alter table public.hb_members add column if not exists sub_order_id text;
alter table public.hb_members add column if not exists sub_access boolean not null default false;
alter table public.hb_members add column if not exists sub_auto_renew boolean not null default false;
alter table public.hb_members add column if not exists sub_expires_at timestamptz;

create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
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
 elsif p_action in ('enter','order') then
 if not m.adult or not m.photo_checked or m.photo is null then raise exception '성인 확인과 프로필 사진 확인이 필요해요.'; end if;
 drink=p_data->>'drinkId';
 if drink not in ('highball','wine','wine-hour','beer','whiskey','cocktail','citrus') then raise exception '음료를 선택해 주세요.'; end if;
 cost=case when drink='wine-hour' then 1000 else 500 end; mins=case when drink='wine-hour' then 60 else 30 end;
 if not subscribed and m.balance<cost then raise exception '포인트가 부족해요.'; end if;
 if p_action='enter' then
 if v.id is not null then raise exception '이미 입장한 호점이 있어요.'; end if;
 select id into rid from hb_rooms where region=p_data->>'region' and number=(p_data->>'number')::integer;
 if rid is null then raise exception '호점을 찾을 수 없어요.'; end if;
 select i into s from generate_series(0,11) i where not exists(select 1 from hb_visits where room_id=rid and seat=i) order by i limit 1;
 if s is null then raise exception '자리가 모두 찼어요.'; end if;
 insert into hb_visits(member_id,room_id,seat,drink_id,expires_at,held) values(p_member,rid,s,drink,case when s=11 then 'infinity'::timestamptz else now()+make_interval(mins=>mins) end,case when s=11 then mins*60 end);
 if (select count(*) from hb_visits where room_id=rid)=12 then
 insert into hb_rooms(region,number) select region,max(number)+1 from hb_rooms where region=p_data->>'region' group by region on conflict do nothing;
 end if;
 else
 if v.id is null then raise exception '먼저 입장해 주세요.'; end if;
 if v.seat=11 then update hb_visits set drink_id=drink,held=coalesce(held,0)+mins*60 where member_id=p_member;
 else update hb_visits set drink_id=drink,expires_at=greatest(expires_at,now())+make_interval(mins=>mins) where member_id=p_member; end if;
 end if;
 if subscribed then
 insert into hb_ledger(member_id,label,amount) values(p_member,case when p_action='enter' then '음료 선택 · 입장' else '음료 주문 · 연장' end,0);
 else
 update hb_members set balance=balance-cost where id=p_member;
 insert into hb_ledger(member_id,label,amount) values(p_member,case when p_action='enter' then '음료 선택 · 입장' else '음료 주문 · 연장' end,-cost);
 end if;
 elsif p_action='leave' then
 delete from hb_visits where member_id=p_member;
 delete from hb_focus where member_id=p_member or partner_id=p_member;
 update hb_requests set status='cancelled' where status='pending' and (sender=p_member or receiver=p_member);
 perform hb_cleanup();
 elsif p_action='heartbeat' then
 update hb_visits set heartbeat_at=now(),speaker=coalesce((p_data->>'speaker')::boolean,false) where member_id=p_member;
 elsif p_action='move' then
 s=(p_data->>'seat')::integer;
 if v.id is null or s not between 0 and 11 then raise exception '이동할 자리를 확인해 주세요.'; end if;
 if exists(select 1 from hb_visits where room_id=v.room_id and seat=s and member_id<>p_member) then raise exception '다른 손님이 먼저 앉았어요.'; end if;
 if s<>11 and hb_seconds(v)=0 then raise exception '이용시간이 끝났어요. 한 잔 더 주문해 주세요.'; end if;
 perform hb_seat_update(p_member,s,hb_seconds(v));
 delete from hb_focus where member_id=p_member or partner_id=p_member;
 update hb_requests set status='cancelled' where status='pending' and (sender=p_member or receiver=p_member);
 elsif p_action='request' then
 target=(p_data->>'targetId')::uuid; select * into other from hb_visits where member_id=target;
 if v.id is null or other.id is null or v.room_id<>other.room_id or target=p_member then raise exception '같은 호점의 손님에게만 요청할 수 있어요.'; end if;
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
 if v.id is null or other.id is null or v.room_id<>q.room_id or other.room_id<>q.room_id or v.seat<>q.receiver_seat or other.seat<>q.sender_seat then raise exception '자리가 바뀌어 요청이 취소됐어요.'; end if;
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
 if not exists(select 1 from hb_visits where room_id=rid) then raise exception '아직 손님이 없어요.'; end if;
 if not subscribed and m.balance<500 then raise exception '500P가 필요해요.'; end if;
 if subscribed then
 insert into hb_ledger(member_id,label,amount) values(p_member,'손님 미리보기',0);
 else
 update hb_members set balance=balance-500 where id=p_member;
 insert into hb_ledger(member_id,label,amount) values(p_member,'손님 미리보기',-500);
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'nickname',u.nickname,'photo',case when u.photo is null then null else floor(extract(epoch from u.updated_at))::bigint end,'gender',u.gender,'seat',a.seat,'drinkId',a.drink_id)) from hb_visits a join hb_members u on u.id=a.member_id where a.room_id=rid),'[]');
 elsif p_action='signal' then
 target=(p_data->>'targetId')::uuid;
 if v.id is null or not exists(select 1 from hb_visits where member_id=target and room_id=v.room_id) then raise exception '음성 연결 대상이 없어요.'; end if;
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

create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=public as $$
declare v hb_visits; output jsonb; begin
 select * into v from hb_visits where member_id=p_member;
 select jsonb_build_object(
 'member',(select jsonb_build_object('id',id,'nickname',nickname,'gender',gender,'photo',case when photo is null then null else floor(extract(epoch from updated_at))::bigint end,'photoChecked',photo_checked,'adult',adult,'balance',balance,'subscribed',coalesce(sub_access,false) and (sub_expires_at is null or sub_expires_at>now()),'subAutoRenew',coalesce(sub_auto_renew,false),'subExpiresAt',sub_expires_at,'subOrderId',sub_order_id) from hb_members where id=p_member),
 'visit',case when v.id is null then null else jsonb_build_object('id',v.id,'seat',v.seat,'drinkId',v.drink_id,'seconds',hb_seconds(v),'speaker',v.speaker)||(select jsonb_build_object('region',region,'number',number) from hb_rooms where id=v.room_id) end,
 'waitlist',coalesce((select jsonb_agg(r.region||':'||r.number) from hb_waitlist w join hb_rooms r on r.id=w.room_id where w.member_id=p_member),'[]'),
 'swapRequestsToday',(select count(*) from hb_requests where sender=p_member and kind='swap' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'swapRewardsToday',(select count(*) from hb_ledger where member_id=p_member and label='자리 양보 보상' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'requestedSeats',coalesce((select jsonb_agg(distinct receiver||':'||receiver_seat) from hb_requests where sender=p_member and kind='swap'),'[]'),
 'rooms',coalesce((select jsonb_agg(x) from(select r.region,r.number,r.id,count(hv.member_id)::integer as count from hb_rooms r left join hb_visits hv on hv.room_id=r.id group by r.id order by r.region,r.number)x),'[]'),
 'guests',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'nickname',m.nickname,'photo',case when m.photo is null then null else floor(extract(epoch from m.updated_at))::bigint end,'gender',m.gender,'seat',a.seat,'drinkId',a.drink_id,'seconds',hb_seconds(a),'speaker',a.speaker)) from hb_visits a join hb_members m on m.id=a.member_id where a.room_id=v.room_id and m.id<>p_member),'[]'),
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
end $$;

revoke all on function public.hb_apply_subscription(uuid,text,text,boolean,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.hb_apply_subscription(uuid,text,text,boolean,boolean,timestamptz) to service_role;
revoke all on function public.hb_action(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.hb_action(uuid,text,jsonb) to service_role;
revoke all on function public.hb_snapshot(uuid,bigint,integer) from public, anon, authenticated;
grant execute on function public.hb_snapshot(uuid,bigint,integer) to service_role;
commit;
