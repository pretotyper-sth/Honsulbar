begin;
create or replace function public.hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=public as $$
declare v hb_visits; output jsonb; begin
 select * into v from hb_visits where member_id=p_member;
 select jsonb_build_object(
 'member',(select jsonb_build_object('id',id,'nickname',nickname,'gender',gender,'photo',case when photo is null then null else floor(extract(epoch from updated_at))::bigint end,'photoChecked',photo_checked,'adult',adult,'balance',balance,'subscribed',coalesce(sub_access,false) and (sub_expires_at is null or sub_expires_at>now()),'subAutoRenew',coalesce(sub_auto_renew,false),'subExpiresAt',sub_expires_at,'subOrderId',sub_order_id) from hb_members where id=p_member),
 'visit',case when v.id is null then null else jsonb_build_object('id',v.id,'seat',v.seat,'drinkId',v.drink_id,'seconds',hb_seconds(v),'speaker',v.speaker)||(select jsonb_build_object('region',region,'number',number) from hb_rooms where id=v.room_id) end,
 'waitlist',coalesce((select jsonb_agg(r.region||':'||r.number) from hb_waitlist w join hb_rooms r on r.id=w.room_id where w.member_id=p_member),'[]'),
 'swapRequestsToday',(select count(*) from hb_requests where sender=p_member and kind='swap' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'swapRewardsToday',(select count(*) from hb_ledger where member_id=p_member and label='자리 양보 보상' and created_at>date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),
 'requestedSeats',coalesce((select jsonb_agg(distinct receiver||':'||receiver_seat) from hb_requests where sender=p_member and kind='swap'),'[]'),
 'rooms',coalesce((select jsonb_agg(x) from(select r.region,r.number,r.id,count(hv.member_id)::integer as count,coalesce(bool_or(hv.member_id in (select t.target_id from hb_tickets t where t.member_id=p_member and t.kind='report' and t.target_id is not null)),false) as "hasReportedGuest" from hb_rooms r left join hb_visits hv on hv.room_id=r.id group by r.id order by r.region,r.number)x),'[]'),
 'reportedIds',coalesce((select jsonb_agg(distinct target_id) from hb_tickets where member_id=p_member and kind='report' and target_id is not null),'[]'),
 'guests',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'nickname',m.nickname,'photo',case when m.photo is null then null else floor(extract(epoch from m.updated_at))::bigint end,'gender',m.gender,'seat',a.seat,'drinkId',a.drink_id,'seconds',hb_seconds(a),'speaker',a.speaker)) from hb_visits a join hb_members m on m.id=a.member_id where a.room_id=v.room_id and m.id<>p_member),'[]'),
 'partners',coalesce((select jsonb_object_agg(member_id,partner_id) from hb_focus where member_id in(select member_id from hb_visits where room_id=v.room_id)),'{}'),
 'requests',coalesce((select jsonb_agg(r) from hb_requests r where (receiver=p_member or sender=p_member) and status='pending' and kind<>'wave'),'[]'),
 'notifications',coalesce((select jsonb_agg(x) from(select * from hb_notifications where member_id=p_member order by created_at desc limit 100)x),'[]'),
 'inquiries',coalesce((select jsonb_agg(x) from(select * from hb_tickets where member_id=p_member order by created_at desc limit 100)x),'[]'),
 'ledger',coalesce((select jsonb_agg(x) from(select * from hb_ledger where member_id=p_member order by created_at desc limit least(greatest(p_limit,10),100))x),'[]'),
 'ledgerCount',(select count(*) from hb_ledger where member_id=p_member),
 'attendanceDate',(select to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD') from hb_ledger where member_id=p_member and label='광고 출석 포인트' order by created_at desc limit 1),
 'signals',coalesce((select jsonb_agg(x) from(select id,sender,data from hb_signals where receiver=p_member and id>p_after and created_at>now()-interval '2 minutes' order by id limit 200)x),'[]')
 ) into output; return output;
end $$;

revoke all on function public.hb_snapshot(uuid,bigint,integer) from public, anon, authenticated;
grant execute on function public.hb_snapshot(uuid,bigint,integer) to service_role;
commit;
