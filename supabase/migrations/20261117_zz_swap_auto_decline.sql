begin;

alter table public.hb_visits add column if not exists auto_decline_swaps boolean not null default false;

create or replace function public.hb_reset_swap_auto_decline() returns trigger
language plpgsql set search_path=public as $$
begin
 if (new.seat,new.away,new.room_id) is distinct from (old.seat,old.away,old.room_id) then
  new.auto_decline_swaps:=false;
 end if;
 return new;
end $$;

drop trigger if exists hb_reset_swap_auto_decline on public.hb_visits;
create trigger hb_reset_swap_auto_decline before update of seat,away,room_id on public.hb_visits
for each row execute function public.hb_reset_swap_auto_decline();

do $$ begin
 if to_regprocedure('public.hb_action_before_swap_auto_decline(uuid,text,jsonb)') is null then
  alter function public.hb_action(uuid,text,jsonb) rename to hb_action_before_swap_auto_decline;
 end if;
end $$;

create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 request_row hb_requests;
 visit hb_visits;
 result jsonb;
begin
 if p_action='respond' and p_data->'accept'='false'::jsonb and p_data->'autoDecline'='true'::jsonb then
  perform pg_advisory_xact_lock(73124);
  select * into request_row from hb_requests where id=(p_data->>'id')::uuid and receiver=p_member and kind='swap';
  select * into visit from hb_visits where member_id=p_member and not away;
  if request_row.id is null or visit.id is null or visit.room_id<>request_row.room_id
     or visit.seat is distinct from request_row.receiver_seat then
   raise exception '지금 받은 자리 양보 요청을 확인해 주세요.';
  end if;
  result:=hb_action_before_swap_auto_decline(p_member,p_action,p_data);
  update hb_visits set auto_decline_swaps=true where id=visit.id;
  update hb_requests set status='declined'
   where receiver=p_member and room_id=visit.room_id and receiver_seat=visit.seat and kind='swap' and status='pending' and expires_at>now();
  return result;
 end if;

 result:=hb_action_before_swap_auto_decline(p_member,p_action,p_data);
 if p_action='request' and p_data->>'kind'='swap' then
  update hb_requests r set status='declined' from hb_visits v
   where r.id=(result->>'id')::uuid and r.status='pending' and v.member_id=r.receiver
     and v.room_id=r.room_id and v.seat=r.receiver_seat and not v.away and v.auto_decline_swaps;
  if found then return result||jsonb_build_object('autoDeclined',true); end if;
 end if;
 return result;
end $$;

revoke all on function public.hb_action_before_swap_auto_decline(uuid,text,jsonb),
 public.hb_reset_swap_auto_decline() from public,anon,authenticated,service_role;
revoke all on function public.hb_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_action(uuid,text,jsonb) to service_role;

commit;
