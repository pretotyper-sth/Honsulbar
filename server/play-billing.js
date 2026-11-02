import { createHmac } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { AppError, hash, database, rpc } from './platform.js';

export const PLAY_PRODUCTS = Object.freeze({
  honsulbar_p1000: { points: 1000, won: 1100 },
  honsulbar_p3300: { points: 3300, won: 3300 },
  honsulbar_p6000: { points: 6000, won: 5500 },
  honsulbar_p10000: { points: 10000, won: 8800 },
  honsulbar_p20000: { points: 20000, won: 16500 },
});

export function playBillingConfiguration(member, env = process.env) {
  const mode = env.HB_PLAY_BILLING_MODE || 'test';
  const testers = (env.HB_PLAY_TEST_MEMBER_IDS || '').split(',').map(value => value.trim());
  const ready = ['test', 'live'].includes(mode) && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(env.HB_PLAY_PACKAGE_NAME || '') &&
    !!env.HB_PLAY_SERVICE_ACCOUNT_JSON && (env.HB_IDENTITY_HASH_KEY || '').length >= 32;
  const enabled = !!member && ready && (mode === 'live' || (env.HB_PLAY_LICENSE_TESTERS_CONFIRMED === '1' && testers.includes(member)));
  return {
    enabled, mode, products: PLAY_PRODUCTS,
    subscription: { productId: 'honsulbar_monthly', basePlanId: 'monthly' },
    accountId: enabled ? createHmac('sha256', env.HB_IDENTITY_HASH_KEY).update(`play-account:${member}`).digest('hex') : null,
  };
}

let client;
async function googleRequest(path, method = 'GET') {
  try {
    if (!client) {
      const credentials = JSON.parse(process.env.HB_PLAY_SERVICE_ACCOUNT_JSON || '{}');
      if (!credentials.client_email || !credentials.private_key) throw Error('missing credentials');
      client = await new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/androidpublisher'] }).getClient();
    }
    return (await client.request({ url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${path}`, method, timeout: 15000 })).data;
  } catch {
    // Never expose purchase tokens, Google request URLs or service-account credentials in logs.
    throw new AppError('Google Play 구매 확인이 지연돼요. 잠시 후 다시 시도해 주세요.', 503);
  }
}

export function validatePlayPurchase(data, { productId, accountId, testOnly }) {
  if (data?.purchaseStateContext?.purchaseState !== 'PURCHASED') throw new AppError('완료된 결제가 아니에요. 포인트는 지급되지 않았어요.', 409);
  if (data.obfuscatedExternalAccountId !== accountId) throw new AppError('구매한 계정으로 다시 로그인해 주세요.', 403);
  if (testOnly && data.testPurchaseContext?.fopType !== 'TEST') throw new AppError('무료 테스트 결제만 처리할 수 있어요.', 403);
  const items = data.productLineItem;
  if (!Array.isArray(items) || items.length !== 1 || items[0].productId !== productId || items[0].productOfferDetails?.quantity !== 1 || items[0].productOfferDetails?.refundableQuantity !== 1) {
    throw new AppError('구매 상품을 확인하지 못했어요.', 400);
  }
  return items[0].productOfferDetails.consumptionState === 'CONSUMPTION_STATE_CONSUMED';
}

export async function processPlayPurchase(member, body, { request = googleRequest, db = database, run = rpc, env = process.env } = {}) {
  const config = playBillingConfiguration(member, env);
  if (!config.enabled) throw new AppError('Play 결제 설정을 준비 중이에요.', 503);
  const { productId, purchaseToken } = body || {};
  if (!Object.hasOwn(PLAY_PRODUCTS, productId || '') || typeof purchaseToken !== 'string' || purchaseToken.length < 16 || purchaseToken.length > 8192) throw new AppError('구매 정보를 확인해 주세요.', 400);
  const packageName = env.HB_PLAY_PACKAGE_NAME;
  const order = `play:${hash(`${packageName}:${purchaseToken}`)}`;
  const data = await request(`${encodeURIComponent(packageName)}/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`);
  const consumed = validatePlayPurchase(data, { productId, accountId: config.accountId, testOnly: config.mode === 'test' });
  const existing = await db(`hb_orders?order_id=eq.${order}&select=member_id,sku`);
  if (existing.length && (existing[0].member_id !== member || existing[0].sku !== productId)) throw new AppError('다른 계정의 구매 정보예요.', 403);
  if (consumed && !existing.length) throw new AppError('이미 사용된 구매 정보예요.', 409);
  const product = PLAY_PRODUCTS[productId];
  // The existing transactional ledger enforces order ownership and grants exactly once.
  await run('hb_credit_order', { p_member: member, p_order: order, p_sku: productId, p_points: product.points, p_amount: product.won });
  if (!consumed) await request(`${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`, 'POST');
  return { verified: true, testPurchase: data.testPurchaseContext?.fopType === 'TEST' };
}

export function validatePlaySubscription(data, { productId, accountId, testOnly, now = Date.now() }) {
  if (data?.externalAccountIdentifiers?.obfuscatedExternalAccountId !== accountId) throw new AppError('구매한 계정으로 다시 로그인해 주세요.', 403);
  if (testOnly && !Object.hasOwn(data, 'testPurchase')) throw new AppError('무료 테스트 구독만 처리할 수 있어요.', 403);
  if (!Array.isArray(data.lineItems) || data.lineItems.length !== 1 || data.lineItems[0].productId !== productId) throw new AppError('구독 상품을 확인하지 못했어요.', 400);
  const item = data.lineItems[0];
  const expires = Date.parse(item.expiryTime);
  if (!Number.isFinite(expires)) throw new AppError('구독 기간을 확인하지 못했어요.', 400);
  const state = data.subscriptionState;
  if (!['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_EXPIRED'].includes(state)) {
    throw new AppError('구독 결제가 아직 완료되지 않았어요.', 409);
  }
  const access = expires > now && ['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(state);
  return { access, autoRenew: access && state !== 'SUBSCRIPTION_STATE_CANCELED' && item.autoRenewingPlan?.autoRenewEnabled === true, expires: new Date(expires).toISOString() };
}

export async function processPlaySubscription(member, body, { request = googleRequest, db = database, run = rpc, env = process.env } = {}) {
  const config = playBillingConfiguration(member, env);
  if (!config.enabled) throw new AppError('Play 결제 설정을 준비 중이에요.', 503);
  const { productId, purchaseToken } = body || {};
  if (productId !== config.subscription.productId || typeof purchaseToken !== 'string' || purchaseToken.length < 16 || purchaseToken.length > 8192) throw new AppError('구독 정보를 확인해 주세요.', 400);
  const packageName = env.HB_PLAY_PACKAGE_NAME;
  const order = `play-sub:${hash(`${packageName}:${purchaseToken}`)}`;
  const data = await request(`${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
  const status = validatePlaySubscription(data, { productId, accountId: config.accountId, testOnly: config.mode === 'test' });
  const existing = await db(`hb_orders?order_id=eq.${order}&select=member_id`);
  if (existing.length && existing[0].member_id !== member) throw new AppError('다른 계정의 구독 정보예요.', 403);
  await run('hb_apply_subscription', { p_member: member, p_order: order, p_sku: productId, p_access: status.access, p_auto_renew: status.autoRenew, p_expires: status.expires });
  if (status.access && data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    await request(`${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, 'POST');
  }
  return { verified: true, access: status.access, testPurchase: Object.hasOwn(data, 'testPurchase') };
}
