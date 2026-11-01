do $$ begin
 if to_regprocedure('public.hb_action_before_triage(uuid,text,jsonb)') is null then
  alter function public.hb_action(uuid,text,jsonb) rename to hb_action_before_triage;
 end if;
end $$;
create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; existing uuid; priority text;
begin
 if exists(select 1 from hb_members where id=p_member and banned_until>now()) then
  if p_action='state' then return '{}';end if;
  if p_action='read' then
   update hb_notifications set read_at=now() where member_id=p_member and read_at is null and (nullif(p_data->>'id','') is null or id=(p_data->>'id')::uuid);
   return '{}';
  end if;
  if p_action='ticket' and p_data->>'kind'='inquiry' and nullif(p_data->>'targetId','') is null then
   if length(trim(coalesce(p_data->>'message',''))) not between 1 and 2000 then raise exception '문의 내용을 입력해 주세요.';end if;
   perform pg_advisory_xact_lock(hashtextextended(p_member::text,73125));
   if (select count(*) from hb_tickets where member_id=p_member and created_at>now()-interval '1 hour')>=10 then raise exception '잠시 후 다시 접수해 주세요.';end if;
   insert into hb_tickets(member_id,kind,category,message) values(p_member,'inquiry','이용 제한 이의 제기',trim(p_data->>'message')) returning id into existing;
   insert into hb_outbox(kind,data,dedupe) values('email',jsonb_build_object('ticketId',existing,'category','이용 제한 이의 제기'),'ticket:'||existing);
   return jsonb_build_object('id',existing);
  end if;
 end if;
 if p_action='ticket' and p_data->>'kind'='report' then
  perform pg_advisory_xact_lock(hashtextextended(p_member::text,73125));
  if nullif(p_data->>'targetId','') is not null then
   select id into existing from hb_tickets where member_id=p_member and target_id=(p_data->>'targetId')::uuid and kind='report' and category=p_data->>'category' and status in('pending','reviewing') and created_at>now()-interval '10 minutes' order by created_at desc limit 1;
   if existing is not null then return jsonb_build_object('id',existing,'duplicate',true);end if;
  end if;
 end if;
 result=hb_action_before_triage(p_member,p_action,p_data);
 if p_action='ticket' and p_data->>'kind'='report' then
  priority=case when coalesce(p_data->>'category','')||' '||coalesce(p_data->>'message','') ~ '(미성년|성매매|착취|협박|스토킹|개인정보|사기|피싱|죽이|살해|자해)' then 'urgent' else 'standard' end;
  update hb_tickets set context=context||jsonb_build_object('audioRecorded',false,'evidenceStatus','unverified','priority',priority) where id=(result->>'id')::uuid;
  update hb_outbox set data=data||jsonb_build_object('urgent',priority='urgent') where dedupe='ticket:'||(result->>'id');
  insert into hb_notifications(member_id,kind,title,body,data) values(p_member,'inquiry','신고를 접수했어요','원본 음성은 저장하지 않아요. 상황 설명과 이용 기록을 확인하며, 상대와의 연결 제한은 유지돼요.',jsonb_build_object('inquiryId',result->>'id'));
 end if;
 return result;
end $$;
create or replace function public.hb_report_summary(p_targets uuid[]) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_object_agg(target_id::text,summary),'{}') from (
  select target_id,jsonb_build_object('reports',count(*),'reporters',count(distinct member_id),'urgent',count(*) filter(where context->>'priority'='urgent')) summary from hb_tickets where kind='report' and target_id=any(p_targets) and created_at>now()-interval '30 days' group by target_id
 ) counts;
$$;
revoke all on function public.hb_action_before_triage(uuid,text,jsonb),public.hb_action(uuid,text,jsonb),public.hb_report_summary(uuid[]) from public,anon,authenticated;
grant execute on function public.hb_action_before_triage(uuid,text,jsonb),public.hb_action(uuid,text,jsonb),public.hb_report_summary(uuid[]) to service_role;

do $$ begin
 if to_regprocedure('public.hb_restrict_before_triage(uuid,timestamptz,boolean,text,boolean)') is null then
  alter function public.hb_restrict(uuid,timestamptz,boolean,text,boolean) rename to hb_restrict_before_triage;
 end if;
end $$;
create or replace function public.hb_restrict(p_member uuid,p_until timestamptz default null,p_kick boolean default true,p_reason text default '',p_set_ban boolean default true) returns void language plpgsql security definer set search_path=public as $$
declare description text;
begin
 perform hb_restrict_before_triage(p_member,p_until,p_kick,p_reason,p_set_ban);
 description=case when not p_set_ban then '안전 확인을 위해 현재 바에서 퇴장 처리했어요.' when p_until is null then '계정 이용 제한을 해제했어요.' when p_until>'9000-01-01' then '운영 검토에 따라 계정 이용이 제한됐어요.' else '운영 검토에 따라 '||to_char(p_until at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI')||'까지 이용이 제한돼요.' end;
 insert into hb_notifications(member_id,kind,title,body,data) values(p_member,'moderation','계정 조치 안내',description||' 사유 확인·이의 제기는 앱 내 문의 또는 pretotyper.sth@gmail.com으로 접수해 주세요.','{}');
end $$;
revoke all on function public.hb_restrict_before_triage(uuid,timestamptz,boolean,text,boolean),public.hb_restrict(uuid,timestamptz,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.hb_restrict_before_triage(uuid,timestamptz,boolean,text,boolean),public.hb_restrict(uuid,timestamptz,boolean,text,boolean) to service_role;
