begin;
create or replace function public.hb_review_play_refund(p_order text) returns void
language plpgsql security definer set search_path=public as $$
declare o hb_orders; begin
 if p_order is null or p_order !~ '^play:[a-f0-9]{64}$' then raise exception 'Invalid Play order'; end if;
 select * into o from hb_orders where order_id=p_order for update;
 if o.order_id is null then raise exception 'Play purchase not registered'; end if;
 if o.status in ('refund_review','refunded') then return; end if;
 update hb_orders set status='refund_review' where order_id=p_order;
 insert into hb_tickets(member_id,kind,category,message,status)
 values(o.member_id,'inquiry','결제·환불','Google Play 포인트 환불 확인 필요. 주문: '||p_order||'. 잔액은 자동 차감하지 않았습니다. 사용 내역을 확인한 뒤 처리해 주세요.','pending');
 perform hb_log('play-refund-review',o.member_id,jsonb_build_object('order',p_order,'points',o.points));
end $$;
revoke all on function public.hb_review_play_refund(text) from public,anon,authenticated;
grant execute on function public.hb_review_play_refund(text) to service_role;
commit;
