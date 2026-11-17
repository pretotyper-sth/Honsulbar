begin;

do $$ begin
 if to_regprocedure('public.hb_snapshot_before_visit_clock(uuid,bigint,integer)') is null then
  alter function public.hb_snapshot(uuid,bigint,integer) rename to hb_snapshot_before_visit_clock;
 end if;
end $$;

create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare output jsonb; end_ms bigint;
begin
 output:=hb_snapshot_before_visit_clock(p_member,p_after,p_limit);
 if jsonb_typeof(output->'visit') is distinct from 'object' then return output; end if;
 select floor(extract(epoch from expires_at)*1000)::bigint into end_ms
 from hb_visits
 where id=(output #>> '{visit,id}')::uuid and member_id=p_member
   and safety_remaining is null and solo_since is null and isfinite(expires_at)
   and (away or seat<>11);
 output:=jsonb_set(output,'{visit,clockEndMs}',coalesce(to_jsonb(end_ms),'null'::jsonb));
 return output||jsonb_build_object('clockSampleMs',floor(extract(epoch from clock_timestamp())*1000)::bigint);
end $$;

revoke all on function public.hb_snapshot_before_visit_clock(uuid,bigint,integer),public.hb_snapshot(uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.hb_snapshot(uuid,bigint,integer) to service_role;

commit;
