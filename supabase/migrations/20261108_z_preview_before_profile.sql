begin;
create or replace function public.hb_action_before_triage(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare m hb_members;target uuid;rid uuid;v hb_visits;check_row hb_photo_checks;result jsonb;request_row hb_requests;begin
 perform pg_advisory_xact_lock(73124);
 select * into m from hb_members where id=p_member for update;
 if m.id is null then raise exception '로그인이 필요해요.';end if;
 if m.banned_until>now() then raise exception '이용이 제한된 계정이에요.';end if;
 if p_action='preview' and m.adult is not true then raise exception '이용 자격을 확인할 수 없어요. 다시 로그인해 주세요.';end if;
 if p_action in('enter','request','respond','signal','waitlist','order','move') and (not m.adult or not m.photo_checked or m.photo is null) then raise exception '성인 확인과 프로필 사진 확인이 필요해요.';end if;
 if p_action in('enter','preview','order','signal','request','respond','move') and hb_safety_paused() then raise exception '안전 점검 중이에요. 잠시 후 다시 이용해 주세요.';end if;
 if p_action='profile' and p_data ? 'photo' and coalesce((p_data->>'photoChecked')::boolean,false)=false then raise exception '변경한 사진을 먼저 확인해 주세요.';end if;
 if p_action='profile' and regexp_replace(lower(coalesce(p_data->>'nickname','')),'[[:space:]]','','g') ~ '(조건|성매매|출장|만남알선|오피|스폰|텔레그램|카카오|카톡|라인아이디|입금|대출|투자|피싱|섹스|운영자|관리자|고객센터|토스)' then raise exception '사용할 수 없는 닉네임이에요.';end if;
 if p_action in('enter','preview','waitlist') then
  select id into rid from hb_rooms where region=p_data->>'region' and number=(p_data->>'number')::integer;
  if hb_room_blocked(p_member,rid) then raise exception '이용자 보호를 위해 현재 입장할 수 없는 바예요. 다른 바를 선택해 주세요.';end if;
 end if;
 if p_action in('request','signal','block') then
  target=nullif(p_data->>'targetId','')::uuid;
  if p_action<>'block' and hb_pair_blocked(p_member,target) then raise exception '이용자 보호를 위해 연결할 수 없어요.';end if;
 end if;
 if p_action='respond' then
  select * into request_row from hb_requests where id=(p_data->>'id')::uuid;
  if hb_pair_blocked(request_row.sender,request_row.receiver) then raise exception '이용자 보호를 위해 연결할 수 없어요.';end if;
 end if;
 if p_action in('ticket','block') then
  target=nullif(p_data->>'targetId','')::uuid;
  if target is not null and (p_action='block' or p_data->>'kind'='report') then
   if target=p_member or not exists(select 1 from hb_members where id=target) then raise exception '대상을 확인해 주세요.';end if;
   if not exists(select 1 from hb_visits a join hb_visits b on a.room_id=b.room_id where a.member_id=p_member and b.member_id=target and not a.away and not b.away) then raise exception '같은 바의 손님을 선택해 주세요.';end if;
  end if;
  if p_action='block' then
   insert into hb_blocks(member_id,target_id) values(p_member,target) on conflict do nothing;
   result='{}';
  else
   result=hb_action_before_safety(p_member,p_action,p_data);
   if p_data->>'kind'='report' then
    update hb_outbox set data=data||jsonb_build_object('urgent',coalesce(p_data->>'category','') ~ '(미성년|성매매|착취|협박|스토킹|개인정보|사기|피싱)') where dedupe='ticket:'||(result->>'id');
   end if;
  end if;
  if target is not null and (p_action='block' or p_data->>'kind'='report') then
   delete from hb_focus where (member_id=p_member and partner_id=target) or (member_id=target and partner_id=p_member);
   update hb_requests set status='cancelled' where status='pending' and ((sender=p_member and receiver=target) or (sender=target and receiver=p_member));
   delete from hb_signals where (sender=p_member and receiver=target) or (sender=target and receiver=p_member);
   delete from hb_photo_access where (member_id=p_member and target_id=target) or (member_id=target and target_id=p_member);
   delete from hb_waitlist where (member_id=p_member and room_id in(select room_id from hb_visits where member_id=target)) or (member_id=target and room_id in(select room_id from hb_visits where member_id=p_member));
  end if;
  return result;
 end if;
 result=hb_action_before_safety(p_member,p_action,p_data);
 if p_action='preview' then
  insert into hb_photo_access(member_id,target_id,expires_at) select p_member,member_id,now()+interval '5 minutes' from hb_visits where room_id=rid and not away
  on conflict(member_id,target_id) do update set expires_at=excluded.expires_at;
  result=(select coalesce(jsonb_agg(item||jsonb_build_object('photo',profile_member.photo_version)),'[]') from jsonb_array_elements(result) item join hb_members profile_member on profile_member.id=(item->>'id')::uuid);
 end if;
 return result;
end $$;
commit;
