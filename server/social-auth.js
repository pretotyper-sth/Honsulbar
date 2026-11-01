import { createHmac } from 'node:crypto';
import { AppError, sbUrl } from './platform.js';

export async function verifySocialIdentity(accessToken, provider) {
  if (!['google', 'kakao'].includes(provider) || typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192) throw new AppError('로그인 정보를 확인해 주세요.', 400);
  const url = sbUrl();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const secret = process.env.HB_IDENTITY_HASH_KEY;
  if (!url.startsWith('https://') || !key || !secret || secret.length < 32) throw new AppError('로그인 설정을 준비 중이에요.', 503);
  // The configured Auth server validates the signature and expiry; never trust decoded client claims.
  let response;
  try { response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) }); }
  catch { throw new AppError('로그인 서버에 연결하지 못했어요.', 503); }
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id || user.is_anonymous) throw new AppError('다시 로그인해 주세요.', 401);
  const identity = user.identities?.find(item => item.provider === provider && item.identity_data?.sub);
  if (!identity || user.app_metadata?.provider !== provider) throw new AppError('로그인 수단을 확인해 주세요.', 401);
  const subject = String(identity.identity_data.sub);
  if (!subject || subject.length > 512) throw new AppError('로그인 정보를 확인해 주세요.', 401);
  return { provider, subjectHash: createHmac('sha256', secret).update(`social:${provider}:${subject}`).digest('hex') };
}
