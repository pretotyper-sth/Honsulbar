begin;

alter table public.hb_requests
 add column if not exists gift_drink_id text,
 add column if not exists gift_sender_visit uuid,
 add column if not exists gift_receiver_visit uuid;
alter table public.hb_requests drop constraint if exists hb_requests_kind_check;
alter table public.hb_requests add constraint hb_requests_kind_check
 check (kind in ('swap','focus','wave') or
  (kind='drink-gift' and gift_drink_id is not null and gift_sender_visit is not null and gift_receiver_visit is not null));

do $$ begin
 if to_regprocedure('public.hb_action_before_drink_gifts(uuid,text,jsonb)') is null then
  alter function public.hb_action(uuid,text,jsonb) rename to hb_action_before_drink_gifts;
 end if;
end $$;

create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 gift hb_requests;
 sender hb_members;
 receiver hb_members;
 sender_visit hb_visits;
 receiver_visit hb_visits;
 sender_id uuid;
 receiver_id uuid;
 drink text;
 cost integer;
 minutes integer;
 sending boolean := p_action='request' and p_data->>'kind'='drink-gift';
begin
 if p_action='respond' then
  select * into gift from hb_requests where id=(p_data->>'id')::uuid and kind='drink-gift';
 end if;
 if sending is not true and gift.id is null then
  return hb_action_before_drink_gifts(p_member,p_action,p_data);
 end if;

 perform pg_advisory_xact_lock(73124);
 perform hb_cleanup();
 if hb_safety_paused() then raise exception '안전 점검 중이에요. 잠시 후 다시 이용해 주세요.'; end if;

 if sending then
  sender_id:=p_member;
  receiver_id:=(p_data->>'targetId')::uuid;
  drink:=p_data->>'drinkId';
 else
  select * into gift from hb_requests where id=gift.id for update;
  if gift.receiver is distinct from p_member then raise exception '받은 선물을 찾을 수 없어요.'; end if;
  if gift.status='accepted' and p_data->'accept'='true'::jsonb then
   return jsonb_build_object('id',gift.id,'accepted',true);
  end if;
  if gift.status<>'pending' or gift.expires_at<=now() then raise exception '이미 끝난 제안이에요.'; end if;
  sender_id:=gift.sender;
  receiver_id:=gift.receiver;
  drink:=gift.gift_drink_id;
 end if;

 select * into sender from hb_members where id=sender_id;
 select * into receiver from hb_members where id=receiver_id;
 if sender_id=receiver_id or sender.id is null or receiver.id is null then
  raise exception '받을 손님을 확인해 주세요.';
 end if;
 if not sender.adult or not receiver.adult or not sender.photo_checked or not receiver.photo_checked
    or sender.photo is null or receiver.photo is null or sender.banned_until>now() or receiver.banned_until>now() then
  raise exception '지금은 이 손님과 한 잔을 주고받을 수 없어요.';
 end if;
 if hb_pair_blocked(sender_id,receiver_id) then raise exception '이용자 보호로 한 잔을 보낼 수 없어요.'; end if;

 if not sending and p_data->'accept' is distinct from 'true'::jsonb then
  update hb_requests set status='declined' where id=gift.id;
  insert into hb_notifications(member_id,kind,title,body)
   values(sender_id,'drink-gift','한 잔 제안이 정중히 거절됐어요.','포인트는 차감되지 않았어요.');
  return jsonb_build_object('id',gift.id,'accepted',false);
 end if;

 select * into sender_visit from hb_visits where member_id=sender_id and not away;
 select * into receiver_visit from hb_visits where member_id=receiver_id and not away;
 if sender_visit.id is null or receiver_visit.id is null or sender_visit.room_id<>receiver_visit.room_id
    or (sender_visit.expires_at<>'infinity'::timestamptz and hb_seconds(sender_visit)<=0)
    or (receiver_visit.expires_at<>'infinity'::timestamptz and hb_seconds(receiver_visit)<=0)
    or (not sending and (sender_visit.id<>gift.gift_sender_visit or receiver_visit.id<>gift.gift_receiver_visit)) then
  raise exception '같은 호점에 머무는 손님에게만 한 잔을 보낼 수 있어요.';
 end if;
 if drink is null or drink not in ('highball','wine','wine-hour','beer','whiskey','cocktail','citrus') then
  raise exception '보낼 음료를 선택해 주세요.';
 end if;
 cost:=case when drink='wine-hour' then 1000 else 500 end;
 minutes:=case when drink='wine-hour' then 40 else 20 end;

 if sending then
  if sender.balance<cost then raise exception '포인트가 부족해요.'; end if;
  if exists(select 1 from hb_requests as request where request.sender=sender_id and request.kind='drink-gift'
    and ((status='pending' and expires_at>now()) or created_at>now()-interval '10 seconds')) then
   raise exception '이전 제안이 끝난 뒤에 다시 보내 주세요.';
  end if;
  insert into hb_requests(sender,receiver,room_id,kind,sender_seat,receiver_seat,expires_at,
      gift_drink_id,gift_sender_visit,gift_receiver_visit)
   values(sender_id,receiver_id,sender_visit.room_id,'drink-gift',sender_visit.seat,receiver_visit.seat,
      now()+interval '60 seconds',drink,sender_visit.id,receiver_visit.id)
   returning * into gift;
  return jsonb_build_object('id',gift.id);
 end if;

 update hb_members set balance=balance-cost where id=sender_id and balance>=cost;
 if not found then raise exception '보낸 손님의 포인트가 부족해요.'; end if;
 insert into hb_ledger(member_id,label,amount,reference)
  values(sender_id,'한 잔 선물',-cost,'drink-gift:'||gift.id);
 if receiver_visit.expires_at='infinity'::timestamptz then
  update hb_visits set drink_id=drink,held=coalesce(held,0)+minutes*60 where id=receiver_visit.id;
 else
  update hb_visits set drink_id=drink,expires_at=greatest(expires_at,now())+make_interval(mins=>minutes)
   where id=receiver_visit.id;
 end if;
 update hb_requests set status='accepted' where id=gift.id;
 insert into hb_notifications(member_id,kind,title,body)
  values(sender_id,'drink-gift',receiver.nickname||'님이 한 잔 받았어요.','보낸 음료와 이용시간이 손님에게 추가됐어요.');
 return jsonb_build_object('id',gift.id,'accepted',true);
end $$;

revoke all on function public.hb_action_before_drink_gifts(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.hb_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_action(uuid,text,jsonb) to service_role;

commit;
