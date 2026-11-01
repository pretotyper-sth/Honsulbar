create or replace function public.hb_login(p_key text) returns uuid language plpgsql security definer set search_path=public as $$
declare mid uuid; begin
 select id into mid from hb_members where toss_key=p_key;
 if mid is not null then return mid; end if;
 insert into hb_members(toss_key,adult) values(p_key,true) on conflict(toss_key) do nothing returning id into mid;
 if mid is null then select id into mid from hb_members where toss_key=p_key; return mid; end if;
 insert into hb_bonus_claims(key_hash) values(encode(sha256(convert_to('hb:'||p_key,'UTF8')),'hex')) on conflict do nothing;
 if found then
  update hb_members set balance=balance+2000 where id=mid;
  insert into hb_ledger(member_id,label,amount,reference) values(mid,'가입 축하 포인트',2000,'welcome:'||mid);
 end if;
 return mid;
end $$;
