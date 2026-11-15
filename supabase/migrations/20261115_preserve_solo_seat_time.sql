create or replace function public.hb_seat_update(p_member uuid,p_seat integer,p_seconds integer)
returns void language sql security definer set search_path=public as $$
 update hb_visits set seat=p_seat,
  held=case when p_seat=11 then p_seconds else null end,
  expires_at=case
   when p_seat=11 then 'infinity'::timestamptz
   when seat=11 then now()+make_interval(secs=>p_seconds)
   -- Regular seats share the same clock, including while the visit is paused.
   else expires_at
  end
 where member_id=p_member;
$$;
