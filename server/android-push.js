import { GoogleAuth } from 'google-auth-library';
import { createPrivateKey } from 'node:crypto';
import { AppError, database, hash } from './platform.js';

export function androidPushReady(env = process.env) {
  if (env.HB_FCM_ENABLED !== '1' || !env.HB_FCM_PROJECT_ID) return false;
  try {
    const credentials = JSON.parse(env.HB_FCM_SERVICE_ACCOUNT_JSON || '{}');
    return credentials.type === 'service_account' && credentials.project_id === env.HB_FCM_PROJECT_ID &&
      typeof credentials.client_email === 'string' && credentials.client_email.endsWith(`@${env.HB_FCM_PROJECT_ID}.iam.gserviceaccount.com`) &&
      createPrivateKey(credentials.private_key).asymmetricKeyType === 'rsa';
  } catch { return false; }
}
export async function registerAndroidPush(member, token, { db = database, sessionHash } = {}) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_:\-]{32,4096}$/.test(token)) throw new AppError('알림 기기를 확인해 주세요.', 400);
  if (!/^[a-f0-9]{64}$/.test(sessionHash || '')) throw new AppError('다시 로그인해 주세요.', 401);
  await db('hb_push_devices?on_conflict=token_hash', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: { token_hash: hash(token), member_id: member, session_hash: sessionHash, token, enabled: true, updated_at: new Date().toISOString() } });
}
export async function unregisterAndroidPush(member, token, { db = database } = {}) {
  if (typeof token !== 'string' || token.length > 4096) throw new AppError('알림 기기를 확인해 주세요.', 400);
  await db(`hb_push_devices?member_id=eq.${member}&token_hash=eq.${hash(token)}`, { method: 'DELETE' });
}

let client;
async function sendFCM(message) {
  try {
    if (!client) {
      const credentials = JSON.parse(process.env.HB_FCM_SERVICE_ACCOUNT_JSON || '{}');
      if (!credentials.client_email || !credentials.private_key) throw Error('missing credentials');
      client = await new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] }).getClient();
    }
    await client.request({ url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(process.env.HB_FCM_PROJECT_ID)}/messages:send`, method: 'POST', data: { message }, timeout: 15000 });
    return 'sent';
  } catch (error) {
    if (error.response?.data?.error?.details?.some(detail => detail.errorCode === 'UNREGISTERED')) return 'expired';
    throw new AppError('알림 전송을 완료하지 못했어요.', 503);
  }
}

export function androidPushMessage(job, token) {
  const available = job.data.kind === 'available';
  return {
    token,
    notification: { title: '혼술바', body: available ? '기다리던 바에 빈자리가 생겼어요.' : '문의에 답변이 도착했어요.' },
    // No report body, private photo, voice recording or external URL in a push.
    data: { kind: available ? 'available' : 'reply', eventId: String(job.id) },
    android: { ttl: '600s', collapse_key: String(job.id), notification: { channel_id: 'honsulbar_service', tag: String(job.id) } },
  };
}

export async function sendAndroidPush(job, { db = database, send = sendFCM, ready = androidPushReady() } = {}) {
  if (!ready) return { available: false, delivered: false };
  const rows = await db(`hb_push_devices?member_id=eq.${job.data.memberId}&enabled=eq.true&select=token_hash,token,session_hash`);
  let delivered = false;
  for (const row of rows) {
    const sessions = row.session_hash ? await db(`hb_sessions?token_hash=eq.${row.session_hash}&member_id=eq.${job.data.memberId}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=member_id`) : [];
    if (!sessions.length) { await db(`hb_push_devices?token_hash=eq.${row.token_hash}`, { method: 'DELETE' }); continue; }
    if (await send(androidPushMessage(job, row.token)) === 'expired') await db(`hb_push_devices?token_hash=eq.${row.token_hash}`, { method: 'DELETE' });
    else delivered = true;
  }
  return { available: true, delivered };
}
