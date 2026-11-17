begin;

create or replace function public.hb_departure_credit(v public.hb_visits)
returns integer language sql stable set search_path=public as $$
 select case when v.first_guest_charge>0 and not v.away
  and v.heartbeat_at>=now()-interval '90 seconds'
  and v.first_guest_shared_time+coalesce(now()-v.first_guest_shared_since,interval '0')<interval '1 minute'
  and ((v.first_guest_shared_since is null and v.first_guest_shared_time=interval '0')
   or (select count(*) from hb_ledger l where l.member_id=v.member_id and l.label='첫 손님 입장 포인트 반환'
   and l.created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')<3)
 then v.first_guest_charge end;
$$;

create or replace function public.hb_quick_enter(p_member uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare offer hb_quick_offers; target hb_rooms; partner uuid; result jsonb; region_name text;
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
 delete from hb_quick_waiting where member_id=p_member;
 delete from hb_quick_offers where p_member in(first_member,second_member);
 return result;
end $$;

commit;
