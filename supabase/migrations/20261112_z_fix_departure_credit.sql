begin;

do $$ begin
 if position('hb_action_before_first_guest_credit' in pg_get_functiondef('public.hb_action(uuid,text,jsonb)'::regprocedure))=0
  or position('hb_snapshot_before_departure_credit' in pg_get_functiondef('public.hb_snapshot(uuid,bigint,integer)'::regprocedure))=0 then
  raise exception 'Unexpected first guest credit or snapshot function';
 end if;
end $$;

create or replace function public.hb_departure_credit(v public.hb_visits)
returns integer language sql stable set search_path=public as $$
 select case when v.first_guest_charge>0 and not v.away
  and v.heartbeat_at>=now()-interval '90 seconds'
  and v.first_guest_shared_time+coalesce(now()-v.first_guest_shared_since,interval '0')<interval '1 minute'
  and (select count(*) from hb_ledger l where l.member_id=v.member_id and l.label='첫 손님 입장 포인트 반환'
   and l.created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')<3
 then v.first_guest_charge end;
$$;

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
 if p_action='enter' then select balance into balance_before from hb_members where id=p_member; end if;
 if p_action='leave' then credit:=hb_departure_credit(prior); end if;
 result:=hb_action_before_first_guest_credit(p_member,p_action,p_data);
 if p_action='enter' then
  select * into entered from hb_visits where member_id=p_member;
  select balance_before-balance into charged from hb_members where id=p_member;
  if entered.id is distinct from prior.id and entered.solo_since is not null and charged>0 then
   update hb_visits set first_guest_charge=charged,first_guest_entered_at=now() where id=entered.id;
  end if;
 elsif p_action='order' then
  update hb_visits set first_guest_charge=null,first_guest_shared_since=null where id=prior.id and first_guest_charge is not null;
 elsif prior.first_guest_charge>0 and not prior.away then
  -- Only the first explicit departure can qualify, even if the user later rejoins.
  update hb_visits set first_guest_charge=null,first_guest_shared_since=null where id=prior.id;
  if credit>0 then
   credit_reference:='first-guest-credit:'||prior.id;
   insert into hb_ledger(member_id,label,amount,reference)
    values(p_member,'첫 손님 입장 포인트 반환',credit,credit_reference)
    on conflict(reference) do nothing;
   if found then
    update hb_members set balance=balance+credit where id=p_member;
    delete from hb_visits where id=prior.id;
    result:=result||jsonb_build_object('firstGuestCredit',credit);
   end if;
  end if;
 end if;
 return result;
end $$;

create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare output jsonb; credit integer;
begin
 output:=hb_snapshot_before_departure_credit(p_member,p_after,p_limit);
 select hb_departure_credit(v) into credit from hb_visits v where v.member_id=p_member;
 if credit>0 then
  output:=jsonb_set(output,'{visit,departureCredit}',to_jsonb(credit));
 end if;
 return output;
end $$;

revoke all on function public.hb_departure_credit(public.hb_visits) from public,anon,authenticated;
commit;
