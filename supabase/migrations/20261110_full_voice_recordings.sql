begin;
create table if not exists hb_recording_sessions(
 id uuid primary key, member_id uuid not null references hb_members(id) on delete cascade,
 room_id uuid not null references hb_rooms(id), created_at timestamptz not null default now(),
 reported_until timestamptz
);
create table if not exists hb_recording_chunks(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references hb_recording_sessions(id) on delete cascade,
 sequence bigint not null,created_at timestamptz not null default now(),expires_at timestamptz not null,
 mime text,ciphertext text,iv text,tag text,digest text,
 bytes integer not null default 262144, uploaded boolean not null default false,
 unique(session_id,sequence)
);
create table if not exists hb_recording_daily(
 day date not null,member_id uuid not null references hb_members(id) on delete cascade,
 bytes bigint not null default 0,primary key(day,member_id)
);
create table if not exists hb_recording_reports(
 ticket_id uuid primary key references hb_tickets(id) on delete cascade,
 session_id uuid not null references hb_recording_sessions(id) on delete cascade
);
create or replace function hb_recording_cleanup() returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
 for r in delete from hb_recording_chunks where not uploaded and created_at<now()-interval '90 seconds' returning session_id,bytes,created_at loop
  update hb_recording_daily set bytes=greatest(0,bytes-r.bytes)
   where day=(r.created_at at time zone 'Asia/Seoul')::date and member_id=(select member_id from hb_recording_sessions where id=r.session_id);
 end loop;
 delete from hb_recording_chunks where expires_at<=now();
 delete from hb_recording_sessions s where not exists(select 1 from hb_recording_chunks c where c.session_id=s.id) and s.created_at<now()-interval '1 day';
 delete from hb_recording_daily where day<(now() at time zone 'Asia/Seoul')::date-8;
end $$;
create or replace function hb_recording_allocate(p_member uuid,p_visit uuid,p_sequence bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v hb_visits;c hb_recording_chunks;daykey date;used bigint;
begin
 perform pg_advisory_xact_lock(73124);
 perform hb_recording_cleanup();
 if p_sequence<0 or p_sequence>9007199254740991 then raise exception '녹음 순서를 확인해 주세요.';end if;
 if not exists(select 1 from hb_voice_consents where member_id=p_member and version='2026-11-08-full') then raise exception '가입 동의를 확인해 주세요.';end if;
 select * into v from hb_visits where member_id=p_member and id=p_visit and not away;
 if v.id is null or hb_safety_paused() then raise exception '음성 참여 상태를 확인해 주세요.';end if;
 insert into hb_recording_sessions(id,member_id,room_id) values(v.id,p_member,v.room_id) on conflict do nothing;
 select * into c from hb_recording_chunks where session_id=v.id and sequence=p_sequence;
 if c.id is not null then return jsonb_build_object('id',c.id,'uploaded',c.uploaded);end if;
 daykey=(now() at time zone 'Asia/Seoul')::date;
 insert into hb_recording_daily(day,member_id) values(daykey,p_member) on conflict do nothing;
 select coalesce(sum(bytes),0) into used from hb_recording_chunks;
 if used+262144>67108864 then raise exception '안전 보관 한도에 도달했어요. 잠시 후 이용해 주세요.';end if;
 select coalesce(sum(bytes),0) into used from hb_recording_daily where day=daykey;
 if used+262144>33554432 then raise exception '오늘의 안전 보관 한도에 도달했어요.';end if;
 select bytes into used from hb_recording_daily where day=daykey and member_id=p_member;
 if used+262144>8388608 then raise exception '오늘의 음성 이용 한도에 도달했어요.';end if;
 update hb_recording_daily set bytes=bytes+262144 where day=daykey and member_id=p_member;
 insert into hb_recording_chunks(session_id,sequence,expires_at)
 values(v.id,p_sequence,coalesce((select reported_until from hb_recording_sessions where id=v.id),now()+interval '24 hours')) returning * into c;
 return jsonb_build_object('id',c.id,'uploaded',false);
end $$;
create or replace function hb_recording_upload(p_member uuid,p_id uuid,p_mime text,p_evidence jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare c hb_recording_chunks;s hb_recording_sessions;n integer;begin
 perform pg_advisory_xact_lock(73124);
 select * into c from hb_recording_chunks where id=p_id for update;
 select * into s from hb_recording_sessions where id=c.session_id;
 if c.id is null or s.member_id<>p_member or c.expires_at<=now() then raise exception '녹음 제출을 확인할 수 없어요.';end if;
 if c.uploaded then return;end if;
 if c.created_at<now()-interval '90 seconds' then raise exception '녹음 제출 시간이 지났어요.';end if;
 n=octet_length(p_evidence->>'ciphertext');
 if n<1 or n>262144 or p_mime not in ('audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4') then raise exception '녹음 형식을 확인해 주세요.';end if;
 update hb_recording_chunks set ciphertext=p_evidence->>'ciphertext',iv=p_evidence->>'iv',tag=p_evidence->>'tag',digest=p_evidence->>'digest',mime=p_mime,bytes=n,uploaded=true where id=p_id;
 update hb_recording_daily set bytes=bytes-262144+n where day=(c.created_at at time zone 'Asia/Seoul')::date and member_id=p_member;
end $$;
create or replace function hb_recording_report(p_member uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v hb_visits;result jsonb;until_at timestamptz;begin
 perform pg_advisory_xact_lock(73124);
 select * into v from hb_visits where member_id=p_member and not away;
 if p_data->>'kind'<>'report' or v.id is null then raise exception '신고할 대화를 확인해 주세요.';end if;
 result=hb_action(p_member,'ticket',p_data-'includeRecording');
 if exists(select 1 from hb_recording_sessions where id=v.id and member_id=p_member) then
  update hb_recording_sessions set reported_until=coalesce(reported_until,now()+interval '7 days') where id=v.id returning reported_until into until_at;
  update hb_recording_chunks set expires_at=until_at where session_id=v.id and expires_at>now();
  insert into hb_recording_reports(ticket_id,session_id) values((result->>'id')::uuid,v.id);
  update hb_tickets set context=context||jsonb_build_object('fullRecording',true,'audioRecorded',true,'audioExpiresAt',until_at,'evidenceStatus','participant-submitted-unverified') where id=(result->>'id')::uuid;
 end if;
 return result;
end $$;
create or replace function hb_accept_service_consent(p_member uuid,p_version text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_version is distinct from '2026-11-08-full' then raise exception '최신 동의 내용을 확인해 주세요.';end if;
 if not exists(select 1 from hb_members where id=p_member) then raise exception '다시 로그인해 주세요.';end if;
 insert into hb_service_consents(member_id,version) values(p_member,p_version)
 on conflict(member_id) do update set version=excluded.version,agreed_at=now();
 insert into hb_voice_consents(member_id,version) values(p_member,p_version)
 on conflict(member_id) do update set version=excluded.version,agreed_at=now();
end $$;
-- Update only the consent wrapper, retaining its underlying safety and visit clock logic.
create or replace function hb_snapshot(p_member uuid,p_after bigint default 0,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=public as $$
declare output jsonb;begin
 output=hb_snapshot_before_signup_consent(p_member,p_after,p_limit);
 output=jsonb_set(output,'{member,serviceConsentVersion}',coalesce((select to_jsonb(s.version) from hb_service_consents s join hb_voice_consents v on v.member_id=s.member_id where s.member_id=p_member and v.version='2026-11-08-full'),'null'::jsonb));
 return output;
end $$;
do $$ declare t text;f record;begin
 foreach t in array array['hb_recording_sessions','hb_recording_chunks','hb_recording_daily','hb_recording_reports'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public,anon,authenticated',t);
  execute format('grant all on %I to service_role',t);
 end loop;
 for f in select oid::regprocedure as name from pg_proc where pronamespace='public'::regnamespace and proname like 'hb_recording_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.name);
  execute format('grant execute on function %s to service_role',f.name);
 end loop;
end $$;
commit;
