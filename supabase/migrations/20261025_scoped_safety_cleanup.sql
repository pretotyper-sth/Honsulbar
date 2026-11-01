-- Scope cleanup to paused visits so the API safe-update guard remains enabled.
begin;
create or replace function public.hb_sync_safety_time() returns void language plpgsql security definer set search_path=public as $$
declare cutoff timestamptz;begin
 perform pg_advisory_xact_lock(73124);
 select min(t) into cutoff from (
  select reviewed_at+interval '24 hours' t from hb_safety_ops where id and reviewed_at<now()-interval '24 hours'
  union all select created_at+interval '18 hours' from hb_tickets where kind='report' and status in('pending','reviewing') and created_at<now()-interval '18 hours'
 ) deadlines;
 if cutoff is not null then
  update hb_visits set safety_remaining=case when seat=11 and not coalesce(away,false) then coalesce(held,0) else greatest(0,ceil(extract(epoch from expires_at-cutoff)))::integer end,
   away=true,seat=null,speaker=false,mic=false,held=null,expires_at='infinity'::timestamptz where safety_remaining is null;
  delete from hb_focus where member_id in(select member_id from hb_visits where safety_remaining is not null)
   or partner_id in(select member_id from hb_visits where safety_remaining is not null);
  update hb_requests set status='cancelled' where status='pending';
  delete from hb_signals where sender in(select member_id from hb_visits where safety_remaining is not null)
   or receiver in(select member_id from hb_visits where safety_remaining is not null);
 else
  update hb_visits set expires_at=now()+make_interval(secs=>safety_remaining),safety_remaining=null where safety_remaining is not null;
 end if;
end $$;
revoke all on function public.hb_sync_safety_time() from public,anon,authenticated;
grant execute on function public.hb_sync_safety_time() to service_role;
commit;
