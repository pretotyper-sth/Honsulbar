begin;

alter table public.hb_visits add column if not exists facing smallint not null default 0
 check (facing between -180 and 180);

create or replace function public.hb_reset_departed_seat_facing() returns trigger
language plpgsql set search_path=public as $$
begin
 if old.seat is distinct from new.seat or old.away is distinct from new.away then new.facing := 0; end if;
 return new;
end $$;

drop trigger if exists hb_reset_departed_seat_facing on public.hb_visits;
create trigger hb_reset_departed_seat_facing before update of seat, away on public.hb_visits
 for each row execute function public.hb_reset_departed_seat_facing();

do $$ begin
 if to_regprocedure('public.hb_action_before_bar_orientation(uuid,text,jsonb)') is null then
  alter function public.hb_action(uuid,text,jsonb) rename to hb_action_before_bar_orientation;
 end if;
 if to_regprocedure('public.hb_snapshot_before_bar_orientation(uuid,bigint,integer)') is null then
  alter function public.hb_snapshot(uuid,bigint,integer) rename to hb_snapshot_before_bar_orientation;
 end if;
end $$;

create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 result:=hb_action_before_bar_orientation(p_member,p_action,p_data);
 if p_action='heartbeat' and p_data->>'facing' ~ '^-?[0-9]{1,3}$'
    and p_data->>'seat' ~ '^[0-9]{1,2}$'
    and p_data->>'visitId' ~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
  update hb_visits set facing=greatest(-180,least(180,(p_data->>'facing')::integer))
   where member_id=p_member and not away and id=(p_data->>'visitId')::uuid and seat=(p_data->>'seat')::integer
   and facing is distinct from greatest(-180,least(180,(p_data->>'facing')::integer));
 end if;
 return result;
end $$;

create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=public as $$
declare output jsonb; room uuid;
begin
 output:=hb_snapshot_before_bar_orientation(p_member,p_after,p_limit);
 select room_id into room from hb_visits where member_id=p_member and not away;
 output:=jsonb_set(output,'{guests}',coalesce((
  select jsonb_agg(item||jsonb_build_object('facing',coalesce(v.facing,0)) order by ordinal)
  from jsonb_array_elements(output->'guests') with ordinality as guest(item,ordinal)
  left join hb_visits v on v.member_id=(item->>'id')::uuid and v.room_id=room and not v.away
 ),'[]'));
 return output||jsonb_build_object('declinedSwapIds',coalesce((
  select jsonb_agg(id) from (
   select id from hb_requests where sender=p_member and kind='swap' and status='declined'
   order by created_at desc limit 10
  ) declined
 ),'[]'));
end $$;

revoke all on function public.hb_action_before_bar_orientation(uuid,text,jsonb),
 public.hb_snapshot_before_bar_orientation(uuid,bigint,integer) from public,anon,authenticated,service_role;
revoke all on function public.hb_action(uuid,text,jsonb),public.hb_snapshot(uuid,bigint,integer),
 public.hb_reset_departed_seat_facing() from public,anon,authenticated;
grant execute on function public.hb_action(uuid,text,jsonb),public.hb_snapshot(uuid,bigint,integer) to service_role;

commit;
