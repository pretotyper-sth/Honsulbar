import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';

// Google's demo unit only. Production rewards require signed server-side verification.
export const TEST_REWARD_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
export const nativeTestAds = !!import.meta.env?.VITE_ANDROID_TEST && Capacitor.getPlatform() === 'android';
let initialization;

export async function showAndroidTestReward({ enabled = nativeTestAds, sdk = AdMob, timeoutMs = 120000 } = {}) {
  if (!enabled) throw new Error('Android 로컬 테스트에서만 이용할 수 있어요.');
  const listeners = [];
  let timer;
  try {
    if (sdk === AdMob) {
      initialization ||= sdk.initialize({ initializeForTesting: true }).catch(error => { initialization = null; throw error; });
      await initialization;
    } else await sdk.initialize({ initializeForTesting: true });
    return await new Promise((resolve, reject) => {
      let earned = false, settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
      (async () => {
        listeners.push(await sdk.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
        listeners.push(await sdk.addListener(RewardAdPluginEvents.Dismissed, () => finish(earned ? null : new Error('광고를 끝까지 봐야 포인트를 받아요.'))));
        listeners.push(await sdk.addListener(RewardAdPluginEvents.FailedToShow, () => finish(new Error('광고를 열지 못했어요. 다시 시도해 주세요.'))));
        timer = setTimeout(() => finish(new Error('광고 시간이 지났어요. 다시 시도해 주세요.')), timeoutMs);
        await sdk.prepareRewardVideoAd({ adId: TEST_REWARD_AD_ID, isTesting: true, npa: true });
        if (!settled) sdk.showRewardVideoAd().catch(error => finish(error));
      })().catch(error => finish(error));
    });
  } finally {
    clearTimeout(timer);
    await Promise.allSettled(listeners.map(listener => listener.remove()));
  }
}
