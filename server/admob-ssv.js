import { verify } from 'node:crypto';
import { AppError } from './platform.js';

let cache;
async function googleKeys(fetcher) {
  if (cache && cache.expires > Date.now()) return cache.keys;
  const response = await fetcher('https://www.gstatic.com/admob/reward/verifier-keys.json', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new AppError('광고 검증 키를 확인하지 못했어요.', 503);
  const body = await response.json();
  if (!Array.isArray(body.keys) || !body.keys.length) throw new AppError('광고 검증 키가 없어요.', 503);
  cache = { keys: body.keys, expires: Date.now() + 3600000, fetchedAt: Date.now() };
  return cache.keys;
}

export async function verifyAdmobCallback(query, { keys, fetcher = fetch, now = Date.now() } = {}) {
  if (typeof query !== 'string' || query.length > 12000) throw new AppError('Invalid callback', 400);
  const index = query.indexOf('&signature=');
  if (index < 0 || !/^signature=[^&]+&key_id=\d+$/.test(query.slice(index + 1))) throw new AppError('Invalid signature parameters', 400);
  const params = new URLSearchParams(query);
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new AppError('Duplicate parameters', 400);
  const trusted = keys || await googleKeys(fetcher);
  let key = trusted.find(item => String(item.keyId) === params.get('key_id'));
  if (!key && !keys && Date.now() - cache.fetchedAt >= 60000) { cache = null; key = (await googleKeys(fetcher)).find(item => String(item.keyId) === params.get('key_id')); }
  const signature = params.get('signature');
  if (!key?.pem || !/^[A-Za-z0-9_\-=]+$/.test(signature || '')) throw new AppError('Unknown signing key', 403);
  let valid = false;
  // Google signs the UTF-8 query; Java URI.getQuery() in its reference verifier decodes transport escapes once.
  try { valid = verify('sha256', Buffer.from(decodeURIComponent(query.slice(0,index)),'utf8'), key.pem, Buffer.from(signature,'base64url')); } catch {}
  if (!valid) throw new AppError('Invalid signature', 403);
  const claim = params.get('custom_data'), transaction = params.get('transaction_id'), unit = params.get('ad_unit');
  const timestamp = Number(params.get('timestamp'));
  if (!/^[\da-f-]{36}$/.test(claim || '') || !/^[\da-f]{8,128}$/i.test(transaction || '') || !/^\d+$/.test(unit || '') || !Number.isSafeInteger(timestamp) || timestamp > now + 60000 || timestamp < now - 86400000) throw new AppError('Invalid reward payload', 400);
  return { claim, transaction, unit, timestamp };
}
