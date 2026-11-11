begin;

do $$ begin
 if to_regprocedure('public.hb_snapshot_before_departure_credit(uuid,bigint,integer)') is null then
  alter function public.hb_snapshot(uuid,bigint,integer) rename to hb_snapshot_before_departure_credit;
 end if;
end $$;

create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare output jsonb; credit integer;
begin
 output:=hb_snapshot_before_departure_credit(p_member,p_after,p_limit);
 -- Match the leave action's first guest credit without awarding it.
 select v.first_guest_charge into credit
 from hb_visits v
 cross join lateral (select v.first_guest_shared_time+coalesce(now()-v.first_guest_shared_since,interval '0') as duration) shared
 where v.member_id=p_member and not v.away and v.first_guest_charge>0
  and v.heartbeat_at>=now()-interval '90 seconds'
  and shared.duration<interval '1 minute'
  and (shared.duration>interval '0' or now()-v.first_guest_entered_at>=interval '30 seconds')
  and (select count(*) from hb_ledger l where l.member_id=p_member and l.label='첫 손님 입장 포인트 반환'
   and l.created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')<3;
 if credit is not null then
  output:=jsonb_set(output,'{visit,departureCredit}',to_jsonb(credit));
 end if;
 return output;
end $$;

revoke all on function public.hb_snapshot_before_departure_credit(uuid,bigint,integer) from public,anon,authenticated,service_role;
revoke all on function public.hb_snapshot(uuid,bigint,integer) from public,anon,authenticated;
grant execute on function public.hb_snapshot(uuid,bigint,integer) to service_role;
commit;
