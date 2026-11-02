import { createHmac } from 'node:crypto';
import { AppError, sbUrl, rpc } from './platform.js';

export async function verifySocialIdentity(accessToken, provider, providerToken) {
  if (!['google', 'kakao'].includes(provider) || typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 8192 || typeof providerToken !== 'string' || providerToken.length < 20 || providerToken.length > 8192) throw new AppError('로그인 정보를 확인해 주세요.', 400);
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
  if (!identity) throw new AppError('로그인 수단을 확인해 주세요.', 401);
  const subject = String(identity.identity_data.sub);
  if (!subject || subject.length > 512) throw new AppError('로그인 정보를 확인해 주세요.', 401);
  // Auth can auto-link equal verified emails. A fresh provider token proves which identity signed in.
  let proof;
  try {
    const endpoint = provider === 'google' ? 'https://openidconnect.googleapis.com/v1/userinfo' : 'https://kapi.kakao.com/v1/user/access_token_info';
    const result = await fetch(endpoint, { headers: { Authorization: `Bearer ${providerToken}` }, signal: AbortSignal.timeout(10000) });
    // Preserve Kakao's 64-bit ID as a string; token-info avoids fetching profile/email again.
    proof = result.ok ? (provider === 'kakao' ? JSON.parse((await result.text()).replace(/("id"\s*:\s*)(\d+)/, '$1"$2"')) : await result.json()) : null;
  } catch { throw new AppError('로그인 서버에 연결하지 못했어요.', 503); }
  if (!proof || String(provider === 'google' ? proof.sub : proof.id) !== subject) throw new AppError('로그인 수단을 다시 확인해 주세요.', 401);
  if (provider === 'kakao' && (String(proof.app_id) !== '1632702' || !(proof.expires_in > 0))) throw new AppError('로그인 앱을 확인해 주세요.', 401);
  return { authUserId:user.id, provider, subjectHash: createHmac('sha256', secret).update(`social:${provider}:${subject}`).digest('hex') };
}

export async function socialAuthMember(identity,mode,member=null,codeHash=null,{env=process.env,run=rpc}={}){
 if(env.HB_AUTH_CLEANUP_ENABLED==='1')return run('hb_social_auth',{p_auth_user:identity.authUserId,p_provider:identity.provider,p_subject_hash:identity.subjectHash,p_mode:mode,p_member:member,p_code_hash:codeHash});
 if(mode==='login')return run('hb_social_login',{p_provider:identity.provider,p_subject_hash:identity.subjectHash});
 if(mode==='claim')return run('hb_claim_account_transfer',{p_code_hash:codeHash,p_provider:identity.provider,p_subject_hash:identity.subjectHash,p_toss_key:null});
 await run('hb_link_social_identity',{p_member:member,p_provider:identity.provider,p_subject_hash:identity.subjectHash});return member;
}
