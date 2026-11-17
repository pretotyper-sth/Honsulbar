begin;

-- Both admission and orders use the same underlying action.
do $migration$
declare
 action_sql text := pg_get_functiondef('public.hb_action_before_safety(uuid,text,jsonb)'::regprocedure);
 original_minutes text := 'mins=case when drink=''wine-hour'' then 60 else 30 end;';
 toss_minutes text := $rule$mins=case when current_setting('honsulbar.toss_drink_duration',true)='20-40'
  then case when drink='wine-hour' then 40 else 20 end
  else case when drink='wine-hour' then 60 else 30 end end;$rule$;
begin
 if strpos(action_sql,toss_minutes)>0 then return; end if;
 if (length(action_sql)-length(replace(action_sql,original_minutes,'')))/length(original_minutes)<>2 then
  raise exception 'Expected the existing entry and order duration rules';
 end if;
 execute replace(action_sql,original_minutes,toss_minutes);
end $migration$;

create or replace function public.hb_toss_timed_action(p_member uuid,p_session_hash text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
 previous_duration text;
 result jsonb;
begin
 if p_action not in ('enter','order') then raise exception '지원하지 않는 요청이에요.'; end if;
 if not exists (
  select 1 from hb_sessions
  where token_hash=p_session_hash and member_id=p_member and platform='toss' and expires_at>now()
 ) then raise exception '토스 로그인을 다시 진행해 주세요.'; end if;
 previous_duration:=current_setting('honsulbar.toss_drink_duration',true);
 perform set_config('honsulbar.toss_drink_duration','20-40',true);
 if p_action='enter' then
  result:=hb_quick_enter(p_member,p_data);
 else
  result:=hb_action(p_member,p_action,p_data);
 end if;
 perform set_config('honsulbar.toss_drink_duration',coalesce(previous_duration,''),true);
 return result;
end $$;

revoke all on function public.hb_toss_timed_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_toss_timed_action(uuid,text,text,jsonb) to service_role;

commit;
