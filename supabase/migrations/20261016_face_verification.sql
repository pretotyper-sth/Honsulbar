do $$ begin
 if to_regprocedure('public.hb_action_before_face_verification(uuid,text,jsonb)') is null then
  alter function public.hb_action(uuid,text,jsonb) rename to hb_action_before_face_verification;
 end if;
end $$;
create or replace function public.hb_action(p_member uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare proof hb_photo_checks;
begin
 if p_action='profile' and p_data ? 'photo' then
  if coalesce((p_data->>'faceConsent')::boolean,false)=false then raise exception '얼굴 비교 처리에 동의해 주세요.';end if;
  delete from hb_photo_checks where token_hash=encode(sha256(convert_to(coalesce(p_data->>'photoProof',''),'UTF8')),'hex')
   and member_id=p_member and photo_digest=encode(sha256(convert_to(p_data->>'photo','UTF8')),'hex') and expires_at>now()
   returning * into proof;
  if proof.token_hash is null then raise exception '변경한 사진을 먼저 확인해 주세요.';end if;
  p_data=(p_data-'photoProof'-'faceConsent'-'photoChecked')||jsonb_build_object('photoChecked',true);
 end if;
 return hb_action_before_face_verification(p_member,p_action,p_data);
end $$;
revoke all on function public.hb_action_before_face_verification(uuid,text,jsonb),public.hb_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.hb_action(uuid,text,jsonb) to service_role;
