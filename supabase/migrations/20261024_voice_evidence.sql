begin;
-- Apply before enabling HB_VOICE_EVIDENCE_ENABLED. No member/point reset.
create table if not exists public.hb_voice_consents (
 member_id uuid primary key references hb_members(id) on delete cascade,
 version text not null, agreed_at timestamptz not null default now()
);
create table if not exists public.hb_voice_evidence (
 ticket_id uuid primary key references hb_tickets(id) on delete cascade,
 ciphertext text not null, iv text not null, tag text not null, digest text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days'
);
alter table hb_voice_consents enable row level security;
alter table hb_voice_evidence enable row level security;
revoke all on hb_voice_consents,hb_voice_evidence from public,anon,authenticated;
grant all on hb_voice_consents,hb_voice_evidence to service_role;

create or replace function public.hb_voice_pair_allowed(p_member uuid,p_target uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=p_member and b.member_id=p_target and not coalesce(a.away,false) and not coalesce(b.away,false))
 and not hb_pair_blocked(p_member,p_target)
 and not exists(select 1 from hb_focus where (member_id=p_member and partner_id<>p_target) or (member_id=p_target and partner_id<>p_member));
$$;
revoke all on function public.hb_voice_pair_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.hb_voice_pair_allowed(uuid,uuid) to service_role;

create or replace function public.hb_revoke_voice_consent(p_member uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from hb_visits where member_id=p_member) then perform hb_action(p_member,'leave','{}');end if;
 delete from hb_voice_consents where member_id=p_member;
end $$;
revoke all on function public.hb_revoke_voice_consent(uuid) from public,anon,authenticated;
grant execute on function public.hb_revoke_voice_consent(uuid) to service_role;

create or replace function public.hb_admin_alert_test(p_email text) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_email,73126));
 if (select count(*) from hb_events where name='alert-test-request' and data->>'operator'=p_email and created_at>now()-interval '1 day')>=3 then raise exception '시험 메일은 하루 3번까지 보낼 수 있어요.';end if;
 perform hb_log('alert-test-request',null,jsonb_build_object('operator',p_email));
end $$;
revoke all on function public.hb_admin_alert_test(text) from public,anon,authenticated;
grant execute on function public.hb_admin_alert_test(text) to service_role;

create or replace function public.hb_submit_voice_report(p_member uuid,p_data jsonb,p_evidence jsonb default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; target uuid; room uuid;
begin
 target=(p_data->>'targetId')::uuid;
 if p_evidence is not null then
  if not exists(select 1 from hb_voice_consents where member_id=p_member and version='2026-10-24') or not exists(select 1 from hb_voice_consents where member_id=target and version='2026-10-24') then raise exception '음성 처리 동의를 확인해 주세요.'; end if;
  select a.room_id into room from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=p_member and b.member_id=target and not coalesce(a.away,false) and not coalesce(b.away,false);
  if room is null or hb_pair_blocked(p_member,target) then raise exception '같은 바에서 들은 상대 음성만 제출할 수 있어요.'; end if;
  if exists(select 1 from hb_focus where (member_id=p_member and partner_id<>target) or (member_id=target and partner_id<>p_member)) then raise exception '참여하지 않은 대화는 제출할 수 없어요.'; end if;
 end if;
 result=hb_action(p_member,'ticket',p_data||jsonb_build_object('kind','report'));
 if p_evidence is not null and coalesce((result->>'duplicate')::boolean,false)=false then
  insert into hb_voice_evidence(ticket_id,ciphertext,iv,tag,digest) values((result->>'id')::uuid,p_evidence->>'ciphertext',p_evidence->>'iv',p_evidence->>'tag',p_evidence->>'digest');
  update hb_tickets set context=context||jsonb_build_object('audioRecorded',true,'evidenceStatus','participant-submitted-unverified','audioExpiresAt',now()+interval '7 days') where id=(result->>'id')::uuid;
  update hb_notifications set body='신고를 접수했어요. 첨부 자료와 이용 기록을 확인하며, 상대와의 연결 제한은 유지돼요.' where member_id=p_member and data->>'inquiryId'=result->>'id';
 end if;
 return result;
end $$;
revoke all on function public.hb_submit_voice_report(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.hb_submit_voice_report(uuid,jsonb,jsonb) to service_role;

do $$ begin
 if to_regprocedure('public.hb_retention_before_voice()') is null then alter function public.hb_retention() rename to hb_retention_before_voice; end if;
end $$;
create or replace function public.hb_retention() returns void language plpgsql security definer set search_path=public as $$
begin
 perform hb_retention_before_voice();
 delete from hb_voice_evidence where expires_at<=now();
end $$;
revoke all on function public.hb_retention_before_voice(),public.hb_retention() from public,anon,authenticated;
grant execute on function public.hb_retention_before_voice(),public.hb_retention() to service_role;

commit;
