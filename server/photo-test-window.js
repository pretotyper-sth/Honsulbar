import {randomInt} from 'node:crypto';

// Trusted operator-only, expiring allowance. Ordinary accounts retain the SQL limit.
export async function newPhotoChallenge(member, {database, rpc, now = Date.now()}) {
  try { return await rpc('hb_new_photo_challenge', {p_member: member}); }
  catch (error) {
    if (error.message !== '얼굴 확인 시도가 많아요. 잠시 후 다시 시도해 주세요.') throw error;
    const [permit] = await database(`hb_events?name=eq.photo-test-window&member_id=eq.${member}&select=data,created_at&order=created_at.desc&limit=1`);
    const start = Date.parse(permit?.created_at);
    const end = Date.parse(permit?.data?.expiresAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= now || end - start > 31 * 60000) throw error;
    const [account] = await database(`hb_members?id=eq.${member}&select=adult,banned_until`);
    if (!account?.adult || (account.banned_until && Date.parse(account.banned_until) > now)) throw error;
    const attempts = await database(`hb_photo_challenges?member_id=eq.${member}&created_at=gte.${encodeURIComponent(new Date(start).toISOString())}&select=id&limit=36`);
    if (attempts.length >= 36) throw error;
    const motion = randomInt(2) ? 'near' : 'far';
    const [challenge] = await database('hb_photo_challenges', {method:'POST', headers:{Prefer:'return=representation'}, body:{member_id:member,motion}});
    return {id:challenge.id, motion:challenge.motion};
  }
}
