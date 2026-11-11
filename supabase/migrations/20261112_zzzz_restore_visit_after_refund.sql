begin;

alter table public.hb_visits
 add column if not exists refund_previous_visit_id uuid,
 add column if not exists refund_previous_room_id uuid references public.hb_rooms(id),
 add column if not exists refund_previous_drink_id text,
 add column if not exists refund_previous_expires_at timestamptz;

create or replace function public.hb_quick_enter(p_member uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare offer hb_quick_offers; target hb_rooms; partner uuid; result jsonb; region_name text; previous hb_visits;
begin
 perform pg_advisory_xact_lock(73124);
 if p_data ? 'quickOfferId' then
  select * into offer from hb_quick_offers where id=(p_data->>'quickOfferId')::uuid
   and expires_at>now() and p_member in(first_member,second_member);
  partner:=case when offer.first_member=p_member then offer.second_member else offer.first_member end;
  if offer.id is null or not hb_quick_eligible(partner) or hb_pair_blocked(p_member,partner)
    or exists(select 1 from hb_visits where member_id=partner and not away and room_id<>offer.room_id) then
   raise exception '입장 가능한 자리가 없어졌어요. 다시 찾아 주세요.';
  end if;
  select * into target from hb_rooms where id=offer.room_id;
  result:=hb_action(p_member,'enter',(p_data-'firstGuest')||jsonb_build_object('region',target.region,'number',target.number));
  if (select count(*) from hb_visits where room_id=target.id and not away and member_id in(p_member,partner))=2 then
   delete from hb_quick_offers where id=offer.id;
  end if;
  return result;
 end if;
 region_name:=p_data->>'region';
 if p_data->'firstGuest'='true'::jsonb and region_name in ('서울','경기','인천','부산','대구') then
  perform hb_cleanup();
  select * into previous from hb_visits where member_id=p_member and away and expires_at>now();
  select * into target from hb_rooms r where r.region=region_name
   and not exists(select 1 from hb_visits where room_id=r.id and not away)
   and not hb_room_blocked(p_member,r.id)
   and not exists(select 1 from hb_quick_offers where room_id=r.id and expires_at>now())
   order by r.number limit 1;
  if target.id is null then
   insert into hb_rooms(region,number)
    select region_name,coalesce(max(number),0)+1 from hb_rooms where region=region_name returning * into target;
  end if;
  -- Starting a new wait must not resume a previous visit to the same branch.
  delete from hb_visits where member_id=p_member and room_id=target.id and away;
  p_data:=(p_data-'firstGuest')||jsonb_build_object('number',target.number);
 elsif exists(select 1 from hb_quick_offers o join hb_rooms r on r.id=o.room_id
   where o.expires_at>now() and r.region=region_name and r.number=(p_data->>'number')::integer) then
  raise exception '지금은 입장할 수 없는 호점이에요. 다른 바를 선택해 주세요.';
 end if;
 result:=hb_action(p_member,'enter',p_data);
 if previous.id is not null then
  update hb_visits
   set refund_previous_visit_id=previous.id, refund_previous_room_id=previous.room_id,
       refund_previous_drink_id=previous.drink_id, refund_previous_expires_at=previous.expires_at
   where member_id=p_member and id<>previous.id and not away and first_guest_charge>0;
 end if;
 delete from hb_quick_waiting where member_id=p_member;
 delete from hb_quick_offers where p_member in(first_member,second_member);
 return result;
end $$;

create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare prior hb_visits; entered hb_visits; balance_before integer; charged integer;
 credit integer; result jsonb; credit_reference text; first_region text; first_number integer;
begin
 if p_action not in ('enter','leave','order') then
  return hb_action_before_first_guest_credit(p_member,p_action,p_data);
 end if;
 perform pg_advisory_xact_lock(73124);
 perform hb_cleanup();
 select * into prior from hb_visits where member_id=p_member;
 if p_action='enter' and p_data->'firstGuest'='true'::jsonb then
  first_region:=p_data->>'region';
  if first_region is null or first_region not in ('서울','경기','인천','부산','대구') then
   raise exception '선호 지역을 다시 선택해 주세요.';
  end if;
  select r.number into first_number from hb_rooms r where r.region=first_region
   and not exists(select 1 from hb_visits v where v.room_id=r.id and not v.away)
   and not hb_room_blocked(p_member,r.id)
   order by r.number limit 1;
  if first_number is null then
   select coalesce(max(number),0)+1 into first_number from hb_rooms where region=first_region;
   insert into hb_rooms(region,number) values(first_region,first_number);
  end if;
  p_data:=p_data||jsonb_build_object('number',first_number);
 end if;
 if p_action in ('enter','order') then
  select balance into balance_before from hb_members where id=p_member for update;
 end if;
 if p_action='leave' then credit:=hb_departure_credit(prior); end if;
 result:=hb_action_before_first_guest_credit(p_member,p_action,p_data);
 if p_action='enter' then
  select * into entered from hb_visits where member_id=p_member;
  select balance_before-balance into charged from hb_members where id=p_member;
  if entered.id is distinct from prior.id and entered.solo_since is not null and charged>0 then
   update hb_visits set first_guest_charge=charged,first_guest_entered_at=now() where id=entered.id;
  end if;
 elsif p_action='order' and prior.first_guest_charge>0 then
  if prior.first_guest_shared_since is null and prior.first_guest_shared_time=interval '0' then
   select balance_before-balance into charged from hb_members where id=p_member;
   update hb_visits set first_guest_order_charge=first_guest_order_charge+charged where id=prior.id;
  else
   update hb_visits set first_guest_charge=null,first_guest_shared_since=null,first_guest_order_charge=0 where id=prior.id;
  end if;
 elsif p_action='leave' and prior.first_guest_charge>0 and not prior.away then
  -- Only the first explicit departure can qualify, even if the user later rejoins.
  update hb_visits set first_guest_charge=null,first_guest_shared_since=null,first_guest_order_charge=0 where id=prior.id;
  if credit>0 then
   credit_reference:='first-guest-credit:'||prior.id;
   insert into hb_ledger(member_id,label,amount,reference)
    values(p_member,'첫 손님 입장 포인트 반환',credit,credit_reference)
    on conflict(reference) do nothing;
   if found then
    update hb_members set balance=balance+credit where id=p_member;
    delete from hb_visits where id=prior.id;
    -- The earlier visit keeps its original deadline while the guest is away.
    if prior.refund_previous_visit_id is not null and prior.refund_previous_expires_at>now() then
     insert into hb_visits(member_id,id,room_id,drink_id,expires_at,away)
      values(p_member,prior.refund_previous_visit_id,prior.refund_previous_room_id,
             prior.refund_previous_drink_id,prior.refund_previous_expires_at,true);
    end if;
    result:=result||jsonb_build_object('firstGuestCredit',credit);
   end if;
  end if;
 end if;
 if p_action='leave' and prior.refund_previous_visit_id is not null then
  update hb_visits set refund_previous_visit_id=null,refund_previous_room_id=null,
   refund_previous_drink_id=null,refund_previous_expires_at=null
   where member_id=p_member and id=prior.id;
 end if;
 return result;
end $$;

commit;
