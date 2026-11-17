begin;

create or replace function public.hb_operating_drink_minutes(p_drink text) returns integer
language sql stable security definer set search_path=public as $$
 select coalesce(
  case when settings ? 'drinkMinutes' then (settings->'drinkMinutes'->>p_drink)::integer
       when p_drink='wine-hour' then 40 end,
  (settings->>'defaultDrinkMinutes')::integer,
  20
 )
 from hb_bar_operations where id=1
$$;

alter table public.hb_requests add column if not exists gift_minutes integer
 check(gift_minutes between 1 and 120);

do $migration$
declare
 entry_sql text := pg_get_functiondef('public.hb_action_before_safety(uuid,text,jsonb)'::regprocedure);
 gift_sql text := pg_get_functiondef('public.hb_action_before_swap_auto_decline(uuid,text,jsonb)'::regprocedure);
 fixed_entry text := $rule$then case when drink='wine-hour' then 40 else 20 end$rule$;
 fixed_gift text := $rule$minutes:=case when drink='wine-hour' then 40 else 20 end;$rule$;
begin
 if strpos(entry_sql,'honsulbar.toss_drink_minutes')=0 then
  if (length(entry_sql)-length(replace(entry_sql,fixed_entry,'')))<>2*length(fixed_entry) then
   raise exception 'Expected both fixed Toss drink time rules';
  end if;
  execute replace(entry_sql,fixed_entry,
   $rule$then coalesce(nullif(current_setting('honsulbar.toss_drink_minutes',true),'')::integer,hb_operating_drink_minutes(drink))$rule$);
 end if;
 if strpos(gift_sql,'gift.gift_minutes')=0 then
  if strpos(gift_sql,fixed_gift)=0
     or strpos(gift_sql,'gift_drink_id,gift_sender_visit,gift_receiver_visit)')=0
     or strpos(gift_sql,'drink,sender_visit.id,receiver_visit.id)')=0 then
   raise exception 'Expected the existing drink gift action';
  end if;
  gift_sql:=replace(gift_sql,fixed_gift,$rule$minutes:=case when sending then hb_operating_drink_minutes(drink)
  else coalesce(gift.gift_minutes,case when drink='wine-hour' then 40 else 20 end) end;
 if sending and p_data ? 'expectedMinutes' and p_data->>'expectedMinutes' is distinct from minutes::text then
  raise exception '음료 이용시간이 바뀌었어요. 확인한 뒤 다시 시도해 주세요.';
 end if;$rule$);
  gift_sql:=replace(gift_sql,'gift_drink_id,gift_sender_visit,gift_receiver_visit)',
                            'gift_drink_id,gift_sender_visit,gift_receiver_visit,gift_minutes)');
  execute replace(gift_sql,'drink,sender_visit.id,receiver_visit.id)',
                           'drink,sender_visit.id,receiver_visit.id,minutes)');
 end if;
end $migration$;

create or replace function public.hb_toss_timed_action(p_member uuid,p_session_hash text,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 previous_version text;
 previous_minutes text;
 minutes integer;
 result jsonb;
begin
 if p_action not in ('enter','order') then raise exception '지원하지 않는 요청이에요.'; end if;
 if not exists (
  select 1 from hb_sessions where token_hash=p_session_hash and member_id=p_member and platform='toss' and expires_at>now()
 ) then raise exception '토스 로그인을 다시 진행해 주세요.'; end if;
 minutes:=hb_operating_drink_minutes(p_data->>'drinkId');
 if p_data ? 'expectedMinutes' and p_data->>'expectedMinutes' is distinct from minutes::text then
  raise exception '음료 이용시간이 바뀌었어요. 확인한 뒤 다시 시도해 주세요.';
 end if;
 previous_version:=current_setting('honsulbar.toss_drink_duration',true);
 previous_minutes:=current_setting('honsulbar.toss_drink_minutes',true);
 perform set_config('honsulbar.toss_drink_duration','20-40',true);
 perform set_config('honsulbar.toss_drink_minutes',minutes::text,true);
 if p_action='enter' then
  result:=hb_quick_enter(p_member,p_data);
 else
  result:=hb_action(p_member,p_action,p_data);
 end if;
 perform set_config('honsulbar.toss_drink_minutes',coalesce(previous_minutes,''),true);
 perform set_config('honsulbar.toss_drink_duration',coalesce(previous_version,''),true);
 return result;
end $$;

revoke all on function public.hb_operating_drink_minutes(text),
 public.hb_toss_timed_action(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_operating_drink_minutes(text),
 public.hb_toss_timed_action(uuid,text,text,jsonb) to service_role;
commit;
