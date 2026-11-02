import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';

export const nativePlayBilling = Capacitor.getPlatform() === 'android' && !import.meta.env?.VITE_ANDROID_TEST;

export async function purchasePlayPoints(config, points, verify, { sdk = NativePurchases, enabled = nativePlayBilling } = {}) {
  if (!enabled || !config?.enabled || !config.accountId) throw new Error('Play 결제 설정을 준비 중이에요.');
  if (config.checkoutAllowed === false) throw new Error('안전 점검 중에는 새 결제를 진행할 수 없어요.');
  const productId = Object.entries(config.products || {}).find(([, product]) => product.points === points)?.[0];
  if (!productId) throw new Error('결제 상품을 준비하고 있어요.');
  await sdk.configure({ autoFinishTransactions: false });
  const { products } = await sdk.getProducts({ productIdentifiers: [productId], productType: PURCHASE_TYPE.INAPP });
  const product = products.find(product => product.identifier === productId && !product.offerId);
  if (!product) throw new Error('Google Play에서 상품을 찾지 못했어요.');
  if (product.currencyCode !== 'KRW' || product.price !== config.products[productId].won) throw new Error('상품 가격이 변경됐어요. 잠시 후 다시 시도해 주세요.');
  const purchase = await sdk.purchaseProduct({ productIdentifier: productId, productType: PURCHASE_TYPE.INAPP, appAccountToken: config.accountId, isConsumable: true, autoAcknowledgePurchases: false });
  if (String(purchase.purchaseState) !== '1' || !purchase.purchaseToken) throw new Error('결제가 아직 완료되지 않았어요.');
  // The server verifies ownership/status and consumes after an idempotent point grant.
  return verify({ productId, purchaseToken: purchase.purchaseToken });
}

export async function recoverPlayPurchases(config, verify, { sdk = NativePurchases, enabled = nativePlayBilling } = {}) {
  if (!enabled || !config?.enabled || !config.accountId) return;
  await sdk.configure({ autoFinishTransactions: false });
  const { purchases } = await sdk.getPurchases({ productType: PURCHASE_TYPE.INAPP, appAccountToken: config.accountId });
  for (const purchase of purchases) {
    if (String(purchase.purchaseState) === '1' && purchase.purchaseToken && Object.hasOwn(config.products, purchase.productIdentifier)) {
      await verify({ productId: purchase.productIdentifier, purchaseToken: purchase.purchaseToken });
    }
  }
}

export async function purchasePlaySubscription(config, verify, { sdk = NativePurchases, enabled = nativePlayBilling } = {}) {
  if (!enabled || !config?.enabled || !config.accountId) throw new Error('Play 결제 설정을 준비 중이에요.');
  if (config.checkoutAllowed === false) throw new Error('안전 점검 중에는 새 결제를 진행할 수 없어요.');
  const { productId, basePlanId } = config.subscription;
  await sdk.configure({ autoFinishTransactions: false });
  const { products } = await sdk.getProducts({ productIdentifiers: [productId], productType: PURCHASE_TYPE.SUBS });
  const product = products.find(item => item.planIdentifier === productId && item.identifier === basePlanId && !item.offerId);
  if (!product?.offerToken) throw new Error('Google Play에서 구독 상품을 찾지 못했어요.');
  if (product.currencyCode !== 'KRW' || product.price !== 13200) throw new Error('구독 가격이 변경됐어요. 잠시 후 다시 시도해 주세요.');
  const purchase = await sdk.purchaseProduct({ productIdentifier: productId, planIdentifier: basePlanId, offerToken: product.offerToken, productType: PURCHASE_TYPE.SUBS, appAccountToken: config.accountId, autoAcknowledgePurchases: false });
  if (String(purchase.purchaseState) !== '1' || !purchase.purchaseToken) throw new Error('구독 결제가 아직 완료되지 않았어요.');
  return verify({ productId, purchaseToken: purchase.purchaseToken });
}

export async function recoverPlaySubscription(config, verify, { sdk = NativePurchases, enabled = nativePlayBilling } = {}) {
  if (!enabled || !config?.enabled || !config.accountId) return;
  await sdk.configure({ autoFinishTransactions: false });
  const { purchases } = await sdk.getPurchases({ productType: PURCHASE_TYPE.SUBS, appAccountToken: config.accountId });
  for (const purchase of purchases) {
    if (String(purchase.purchaseState) === '1' && purchase.purchaseToken && purchase.productIdentifier === config.subscription.productId) {
      await verify({ productId: purchase.productIdentifier, purchaseToken: purchase.purchaseToken });
    }
  }
}

export const managePlaySubscriptions = () => NativePurchases.manageSubscriptions();
