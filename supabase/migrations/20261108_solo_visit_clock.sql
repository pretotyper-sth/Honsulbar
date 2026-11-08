begin;
alter table public.hb_visits add column if not exists solo_since timestamptz,
 add column if not exists first_guest_charge integer,
 add column if not exists first_guest_entered_at timestamptz,
 add column if not exists first_guest_shared_since timestamptz,
 add column if not exists first_guest_shared_time interval not null default interval '0';

create or replace function public.hb_seconds(v hb_visits) returns integer language sql stable as $$
 select case
  when v.safety_remaining is not null then v.safety_remaining
  when v.seat=11 and not v.away then coalesce(v.held,0)
  else greatest(0,ceil(extract(epoch from v.expires_at-coalesce(v.solo_since,now()))))::integer
 end;
$$;

create or replace function public.hb_adjust_solo_visit() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.safety_remaining is not null then
  new.safety_remaining := hb_seconds(old);
  new.first_guest_charge := null;
  new.first_guest_shared_since := null;
  new.solo_since := null;
 elsif new.away then
  new.expires_at := now()+greatest(interval '0',old.expires_at-old.solo_since);
  new.solo_since := null;
 elsif new.seat=11 then
  new.solo_since := null;
 elsif new.expires_at is distinct from old.expires_at then
  -- An order extends the remaining time, including repeated orders of the same drink.
  new.expires_at := greatest(old.expires_at,old.solo_since)
    + (new.expires_at-greatest(old.expires_at,now()));
 end if;
 return new;
end $$;

create or replace function public.hb_sync_solo_room(p_room uuid) returns void
language plpgsql security definer set search_path=public as $$
declare solo boolean;
begin
 select count(*)=1 into solo from hb_visits where room_id=p_room and not away;
 if solo then
  update hb_visits set first_guest_shared_time=first_guest_shared_time+(now()-first_guest_shared_since),
   first_guest_shared_since=null
   where room_id=p_room and not away and first_guest_shared_since is not null;
  update hb_visits set solo_since=now()
   where room_id=p_room and not away and seat<>11 and solo_since is null and expires_at>now();
 else
  update hb_visits set first_guest_shared_since=now()
   where room_id=p_room and not away and first_guest_charge>0 and first_guest_shared_since is null;
  update hb_visits set expires_at=expires_at+(now()-solo_since),solo_since=null
   where room_id=p_room and solo_since is not null;
 end if;
end $$;

create or replace function public.hb_solo_occupancy_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then
  perform hb_sync_solo_room(old.room_id);
 else
  perform hb_sync_solo_room(new.room_id);
 end if;
 return null;
end $$;

drop trigger if exists hb_adjust_solo_visit on hb_visits;
create trigger hb_adjust_solo_visit before update of away,seat,drink_id,safety_remaining on hb_visits
 for each row when (old.solo_since is not null) execute function hb_adjust_solo_visit();
drop trigger if exists hb_solo_occupancy_changed on hb_visits;
create trigger hb_solo_occupancy_changed after insert or delete or update of away,seat on hb_visits
 for each row execute function hb_solo_occupancy_changed();

create or replace function public.hb_cleanup() returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
 perform hb_sync_safety_time();
 delete from hb_visits where safety_remaining is null and (
  (not coalesce(away,false) and (heartbeat_at<now()-interval '90 seconds' or (solo_since is null and expires_at<=now()-interval '3 minutes')))
  or (coalesce(away,false) and expires_at<=now()));
 delete from hb_focus f where not exists(select 1 from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=f.member_id and b.member_id=f.partner_id and not coalesce(a.away,false) and not coalesce(b.away,false) and a.seat<>11 and b.seat<>11 and abs(a.seat-b.seat)=1);
 update hb_requests set status='expired' where status='pending' and expires_at<now();
 for r in select w.member_id,w.room_id,v.region,v.number from hb_waitlist w join hb_rooms v on v.id=w.room_id where (select count(*) from hb_visits where room_id=w.room_id and not coalesce(away,false))<12 and not hb_room_blocked(w.member_id,w.room_id) for update of w skip locked loop
 perform hb_notify(r.member_id,'available',r.region||' '||r.number||'호점','빈자리가 생겼어요. 지금 입장할 수 있어요.',jsonb_build_object('region',r.region,'number',r.number));
 delete from hb_waitlist where member_id=r.member_id and room_id=r.room_id;
 end loop;
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
 if output->>'visit' is not null then
  output=jsonb_set(output,'{visit,soloPaused}',to_jsonb(exists(select 1 from hb_visits where member_id=p_member and solo_since is not null)));
 end if;
 output=output||jsonb_build_object('safetyPaused',hb_safety_paused());
 return output;
end $$;

do $$ begin
 if to_regprocedure('public.hb_action_before_first_guest_credit(uuid,text,jsonb)') is null then
  alter function public.hb_action(uuid,text,jsonb) rename to hb_action_before_first_guest_credit;
 end if;
end $$;

create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare prior hb_visits; entered hb_visits; balance_before integer; charged integer;
 shared interval; result jsonb; credit_reference text; first_region text; first_number integer;
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
  shared:=prior.first_guest_shared_time+coalesce(now()-prior.first_guest_shared_since,interval '0');
  if shared<interval '1 minute' and (shared>interval '0' or now()-prior.first_guest_entered_at>=interval '30 seconds')
   and (select count(*) from hb_ledger where member_id=p_member and label='첫 손님 입장 포인트 반환'
    and created_at >= date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')<3 then
   credit_reference:='first-guest-credit:'||prior.id;
   insert into hb_ledger(member_id,label,amount,reference)
    values(p_member,'첫 손님 입장 포인트 반환',prior.first_guest_charge,credit_reference)
    on conflict(reference) do nothing;
   if found then
    update hb_members set balance=balance+prior.first_guest_charge where id=p_member;
    delete from hb_visits where id=prior.id;
    result:=result||jsonb_build_object('firstGuestCredit',prior.first_guest_charge);
   end if;
  end if;
 end if;
 return result;
end $$;

revoke all on function public.hb_action_before_first_guest_credit(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.hb_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_action(uuid,text,jsonb) to service_role;

select hb_sync_solo_room(id) from hb_rooms;
revoke all on function public.hb_adjust_solo_visit(), public.hb_sync_solo_room(uuid), public.hb_solo_occupancy_changed() from public,anon,authenticated;
commit;
