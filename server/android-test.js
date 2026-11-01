import { isProduction } from './platform.js';

export function androidTestEnabled() {
  return !isProduction() && process.env.HB_LOCAL_DB === '1' && process.env.HB_DEV_LOGIN === '1' && process.env.HB_ANDROID_TEST === '1';
}

export function androidTestProduct(points) {
  if (!androidTestEnabled()) return null;
  return [1000, 3300, 6000, 10000, 20000].includes(points) ? { points, sku: `local_test_p${points}` } : null;
}
