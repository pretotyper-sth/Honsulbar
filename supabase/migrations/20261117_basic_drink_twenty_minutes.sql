-- Change the duration granted by new basic drink purchases, without rewriting existing visits.
do $$
declare
  definition text := pg_get_functiondef('public.hb_action_before_safety(uuid,text,jsonb)'::regprocedure);
  previous_duration constant text := 'mins=case when drink=''wine-hour'' then 60 else 30 end';
  new_duration constant text := 'mins=case when drink=''wine-hour'' then 60 else 20 end';
  updated text := replace(definition, previous_duration, new_duration);
begin
  -- The core action calculates duration once for entry and once for extensions.
  if (length(updated) - length(replace(updated, new_duration, ''))) <> 2 * length(new_duration) then
    raise exception 'Expected two basic drink durations in hb_action_before_safety';
  end if;
  if updated <> definition then
    execute updated;
  end if;
end;
$$;
