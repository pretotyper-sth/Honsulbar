import { createHash, timingSafeEqual } from 'node:crypto';
import { rpc, parseTossTime } from '../server/platform.js';

function equalSecret(received, expected) {
  const left = createHash('sha256').update(received).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const credential = process.env.TOSS_IAP_BASIC_AUTH;
  if (credential) {
    const received = req.headers.authorization || '';
    const encoded = `Basic ${Buffer.from(credential, 'utf8').toString('base64')}`;
    if (!equalSecret(received, encoded) && !equalSecret(received, `Basic ${credential}`)) return res.status(401).end();
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_body' }); }
  }

  if (body.eventType === 'callback.registration_verification') return res.status(204).end();
  if (body.eventType !== 'subscription.status_changed') return res.status(204).end();

  const orderId = String(body.orderId || '');
  if (!/^[\w-]{8,80}$/.test(orderId)) return res.status(400).json({ error: 'invalid_order' });
  const current = body.subscription?.current || {};
  try {
    await rpc('hb_apply_subscription', {
      p_member: null,
      p_order: orderId,
      p_sku: body.sku || '',
      p_access: !!current.accessGranted,
      p_auto_renew: !!current.autoRenew,
      p_expires: parseTossTime(current.expiresAt),
    });
  } catch {
    return res.status(503).json({ error: 'callback_processing_failed' });
  }
  return res.status(204).end();
}
