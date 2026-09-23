import { createHash, timingSafeEqual } from 'node:crypto';

const REFERRERS = new Set(['UNLINK', 'WITHDRAWAL_TERMS', 'WITHDRAWAL_TOSS']);

function equalSecret(received, expected) {
  const left = createHash('sha256').update(received).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.headers.origin === 'https://apps-in-toss.toss.im') {
    res.setHeader('Access-Control-Allow-Origin', 'https://apps-in-toss.toss.im');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const credential = process.env.TOSS_UNLINK_BASIC_AUTH;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!credential || !supabaseUrl || !serviceKey) return res.status(503).json({ error: 'callback_not_configured' });

  const received = req.headers.authorization || '';
  const encoded = `Basic ${Buffer.from(credential, 'utf8').toString('base64')}`;
  if (!equalSecret(received, encoded)) return res.status(401).end();

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_body' }); }
  }
  const userKey = String((req.method === 'GET' ? req.query?.userKey : body.userKey) ?? '');
  const referrer = req.method === 'GET' ? req.query?.referrer : body.referrer;
  if (!/^\d{1,30}$/.test(userKey) || !REFERRERS.has(referrer)) return res.status(400).json({ error: 'invalid_event' });
  if (userKey === '0') return res.status(204).end();

  const action = referrer === 'UNLINK' ? 'unlink' : 'withdraw';
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/apply_toss_login_disconnect`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_key: userKey, p_action: action }),
  }).catch(() => null);
  if (!response?.ok) return res.status(503).json({ error: 'callback_processing_failed' });
  return res.status(204).end();
}
