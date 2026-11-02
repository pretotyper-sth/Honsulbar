import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, isAdult } from './platform.js';

// This inspected console channel is TEST-only. A live channel requires a separate reviewed implementation.
export const AGE_TEST_STORE = 'store-16090281-7030-4ca7-96f8-8d842e69bf32';
export const AGE_TEST_CHANNEL = 'channel-key-54b44a2c-5bd1-45bb-b891-78ae62ca4981';
const lifetime = 10 * 60000;
export function ageTestReady(env = process.env) {
  return env.HB_AGE_TEST_ENABLED === '1' && (env.HB_PORTONE_API_SECRET || '').length >= 20 && (env.HB_IDENTITY_HASH_KEY || '').length >= 32;
}
function signature(member, value, env) {
  return createHmac('sha256', env.HB_IDENTITY_HASH_KEY).update(`age-test:${member}:${value}`).digest('hex').slice(0,32);
}
export function startAgeTest(member, {env = process.env, now = Date.now()} = {}) {
  if (!ageTestReady(env)) throw new AppError('본인인증 테스트 설정을 준비 중이에요.',503);
  const value = `${Math.floor((now+lifetime)/1000)}-${randomBytes(8).toString('hex')}`;
  return {id:`ha-${value}-${signature(member,value,env)}`,test:true,storeId:AGE_TEST_STORE,channelKey:AGE_TEST_CHANNEL};
}
export async function completeAgeTest(member, id, {env = process.env, now = Date.now(), fetcher = fetch} = {}) {
  if (!ageTestReady(env)) throw new AppError('본인인증 테스트 설정을 준비 중이에요.',503);
  const parts = /^ha-(\d{10})-([a-f0-9]{16})-([a-f0-9]{32})$/.exec(id || '');
  if (!parts || Number(parts[1])*1000 <= now || Number(parts[1])*1000 > now+lifetime || !timingSafeEqual(Buffer.from(parts[3]),Buffer.from(signature(member,`${parts[1]}-${parts[2]}`,env)))) throw new AppError('인증을 다시 시작해 주세요.',400);
  let response;
  try { response = await fetcher(`https://api.portone.io/identity-verifications/${encodeURIComponent(id)}?storeId=${AGE_TEST_STORE}`,{headers:{Authorization:`PortOne ${env.HB_PORTONE_API_SECRET}`},signal:AbortSignal.timeout(15000)}); }
  catch { throw new AppError('인증 결과 확인이 지연돼요. 잠시 후 다시 확인해 주세요.',503); }
  if (!response.ok) throw new AppError('인증 결과를 확인하지 못했어요. 인증을 완료한 뒤 다시 확인해 주세요.',409);
  let data;
  try { data = await response.json(); } catch { throw new AppError('인증 결과를 확인하지 못했어요.',503); }
  if (!data || typeof data !== 'object') throw new AppError('인증 결과를 확인하지 못했어요.',503);
  const verifiedAt = Date.parse(data.verifiedAt);
  if (data.id !== id || data.status !== 'VERIFIED' || data.channel?.type !== 'TEST' || data.channel?.key !== AGE_TEST_CHANNEL || !Number.isFinite(verifiedAt) || verifiedAt < Number(parts[1])*1000-lifetime-60000 || verifiedAt > now+60000) throw new AppError('완료된 테스트 인증을 확인하지 못했어요.',409);
  if (!isAdult(data.verifiedCustomer?.birthDate,new Date(now))) throw new AppError('만 19세 이상 여부를 확인하지 못했어요.',403);
  // Never persist names, phone numbers, birthdays or CI; a TEST result never changes production adult status.
  return {verified:true,adult:true,test:true,admissionGranted:false};
}
