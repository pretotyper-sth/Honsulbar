begin;

create table if not exists hb_quick_waiting (
 member_id uuid primary key references hb_members on delete cascade,
 region text not null,
 requested_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create table if not exists hb_quick_offers (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null unique references hb_rooms,
 first_member uuid not null references hb_members on delete cascade,
 second_member uuid not null references hb_members on delete cascade,
 expires_at timestamptz not null,
 check (first_member <> second_member)
);
alter table hb_quick_waiting enable row level security;
alter table hb_quick_offers enable row level security;
revoke all on hb_quick_waiting,hb_quick_offers from public,anon,authenticated;

create or replace function hb_quick_eligible(p_member uuid)
returns boolean language sql stable set search_path=public as $$
 select exists(select 1 from hb_members where id=p_member and adult and photo_checked
   and photo is not null and (banned_until is null or banned_until<=now()));
$$;

create or replace function hb_quick_search(p_member uuid,p_command text,p_region text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare offer hb_quick_offers; partner uuid; target hb_rooms; waiting hb_quick_waiting;
begin
 perform pg_advisory_xact_lock(73124);
 delete from hb_quick_waiting where expires_at<=now();
 delete from hb_quick_offers where expires_at<=now();
 if p_command='cancel' then
  delete from hb_quick_waiting where member_id=p_member;
  delete from hb_quick_offers o where p_member in(first_member,second_member)
   and not exists(select 1 from hb_visits where member_id=p_member and room_id=o.room_id and not away);
  return null;
 end if;
 if hb_safety_paused() or not hb_quick_eligible(p_member)
   or p_region not in ('서울','경기','인천','부산','대구')
   or exists(select 1 from hb_visits where member_id=p_member and not away) then
  return null;
 end if;
 perform hb_cleanup();
 select * into offer from hb_quick_offers where p_member in(first_member,second_member);
 if offer.id is not null then
  partner:=case when offer.first_member=p_member then offer.second_member else offer.first_member end;
  if not hb_quick_eligible(partner) or hb_pair_blocked(p_member,partner)
    or exists(select 1 from hb_visits where member_id=partner and not away and room_id<>offer.room_id) then
   delete from hb_quick_offers where id=offer.id;
   return null;
  end if;
 else
  if p_command='start' then
   insert into hb_quick_waiting(member_id,region,expires_at)
    values(p_member,p_region,now()+interval '18 seconds')
    on conflict(member_id) do update set region=excluded.region,expires_at=excluded.expires_at;
  else
   update hb_quick_waiting set expires_at=now()+interval '18 seconds'
    where member_id=p_member and region=p_region returning * into waiting;
   if waiting.member_id is null then return null; end if;
  end if;
  if exists(select 1 from hb_rooms r join hb_visits v on v.room_id=r.id and not v.away
   where r.region=p_region and not hb_room_blocked(p_member,r.id)
   and not exists(select 1 from hb_quick_offers o where o.room_id=r.id)
   group by r.id having count(*)<12) then return null; end if;
  select w.member_id into partner from hb_quick_waiting w
   where w.region=p_region and w.member_id<>p_member and hb_quick_eligible(w.member_id)
   and not hb_pair_blocked(p_member,w.member_id)
   and not exists(select 1 from hb_visits where member_id=w.member_id and not away)
   order by w.requested_at,w.member_id limit 1;
  if partner is null then return null; end if;
  select * into target from hb_rooms r where r.region=p_region
   and not exists(select 1 from hb_visits where room_id=r.id)
   and not exists(select 1 from hb_quick_offers where room_id=r.id)
   order by r.number limit 1;
  if target.id is null then
   insert into hb_rooms(region,number)
    select p_region,coalesce(max(number),0)+1 from hb_rooms where region=p_region
    returning * into target;
  end if;
  insert into hb_quick_offers(room_id,first_member,second_member,expires_at)
   values(target.id,partner,p_member,now()+interval '90 seconds') returning * into offer;
  delete from hb_quick_waiting where member_id in(p_member,partner);
 end if;
 select * into target from hb_rooms where id=offer.room_id;
 return (select jsonb_build_object('id',offer.id,'region',target.region,'number',target.number,
  'expiresAt',offer.expires_at,'guest',jsonb_build_object('id',id,'nickname',nickname,'photo',photo_version))
  from hb_members where id=partner);
end $$;

create or replace function hb_quick_enter(p_member uuid,p_data jsonb)
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

create or replace function hb_can_view_quick_photo(p_viewer uuid,p_target uuid,p_version bigint)
returns boolean language sql stable security definer set search_path=public as $$
 select not hb_safety_paused() and hb_quick_eligible(p_viewer) and hb_quick_eligible(p_target)
 and not hb_pair_blocked(p_viewer,p_target)
 and exists(select 1 from hb_sessions where member_id=p_viewer and expires_at>now())
 and exists(select 1 from hb_members where id=p_target and photo_version=p_version)
 and exists(select 1 from hb_quick_offers o where expires_at>now()
  and p_viewer in(first_member,second_member) and p_target in(first_member,second_member)
  and p_viewer<>p_target
  and not exists(select 1 from hb_visits where member_id in(p_viewer,p_target) and not away and room_id<>o.room_id));
$$;

create or replace function hb_quick_visible_rooms(p_state jsonb)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_set(p_state,'{rooms}',coalesce((
  select jsonb_agg(room order by ordinal)
  from jsonb_array_elements(p_state->'rooms') with ordinality as entries(room,ordinal)
  where not exists(select 1 from hb_quick_offers o where o.room_id=(room->>'id')::uuid and o.expires_at>now())
 ),'[]'::jsonb));
$$;

revoke all on function hb_quick_eligible(uuid),hb_quick_search(uuid,text,text),
 hb_quick_enter(uuid,jsonb),hb_can_view_quick_photo(uuid,uuid,bigint),hb_quick_visible_rooms(jsonb) from public,anon,authenticated;
grant execute on function hb_quick_search(uuid,text,text),hb_quick_enter(uuid,jsonb),
 hb_can_view_quick_photo(uuid,uuid,bigint),hb_quick_visible_rooms(jsonb) to service_role;
commit;
