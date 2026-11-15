begin;

create or replace function public.hb_new_photo_challenge(p_member uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
 challenge hb_photo_challenges;
begin
 perform pg_advisory_xact_lock(hashtext(p_member::text));
 if not exists(select 1 from hb_members where id=p_member and adult and (banned_until is null or banned_until<=now())) then
  raise exception '로그인이 필요해요.';
 end if;
 if (select count(*) from hb_photo_challenges where member_id=p_member and created_at>now()-interval '3 minutes')>=10 then
  raise exception '얼굴 확인 시도가 많아요. 잠시 후 다시 시도해 주세요.';
 end if;
 insert into hb_photo_challenges(member_id,motion)
 values(p_member,case when random()<0.5 then 'near' else 'far' end)
 returning * into challenge;
 return jsonb_build_object('id',challenge.id,'motion',challenge.motion);
end $$;

commit;
