begin;

create or replace function public.hb_update_toss_profile_photo(p_member uuid, p_session_hash text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(73124);
 if not exists (
  select 1 from hb_sessions
  where token_hash=p_session_hash and member_id=p_member and platform='toss' and expires_at>now()
 ) then raise exception '토스 로그인을 다시 진행해 주세요.'; end if;
 if coalesce(p_data->>'photo','') !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$'
    or length(p_data->>'photo')>400000 then raise exception '프로필 사진을 다시 선택해 주세요.'; end if;
 return hb_action_before_face_verification(
  p_member,'profile',(p_data-'photoProof'-'faceConsent'-'photoChecked')||jsonb_build_object('photoChecked',true)
 );
end $$;

revoke all on function public.hb_update_toss_profile_photo(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_update_toss_profile_photo(uuid,text,jsonb) to service_role;

commit;
