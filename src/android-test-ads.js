import { Capacitor } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';

// Demo rewards and live SSV use the same native completion flow.
export const TEST_REWARD_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
export const nativeTestAds = !!import.meta.env?.VITE_ANDROID_TEST && !import.meta.env?.VITE_FLOW_MOCK && Capacitor.getPlatform() === 'android';
let initialization;
let initializationMode;

export async function showAndroidTestReward({ enabled = nativeTestAds, sdk = AdMob, timeoutMs = 120000 } = {}) {
  return showAndroidReward({adId:TEST_REWARD_AD_ID,isTesting:true},{enabled,sdk,timeoutMs});
}

export async function showAndroidReward(ad, { enabled = Capacitor.getPlatform() === 'android', sdk = AdMob, timeoutMs = 120000 } = {}) {
  if (!enabled) throw new Error('Android 앱에서 이용해 주세요.');
  if (!ad?.enabled && !ad?.isTesting) throw new Error('광고 설정을 준비 중이에요.');
  if (!/^ca-app-pub-\d+\/\d+$/.test(ad.adId || '')) throw new Error('광고 설정을 준비 중이에요.');
  const listeners = [];
  let timer;
  try {
    if (!ad.isTesting) {
      let consent = await sdk.requestConsentInfo();
      if (!consent.canRequestAds && consent.isConsentFormAvailable) consent = await sdk.showConsentForm();
      if (!consent.canRequestAds) throw new Error('광고 동의 상태를 확인해 주세요.');
    }
    if (sdk === AdMob) {
      if (initializationMode !== !!ad.isTesting) { initialization = null; initializationMode = !!ad.isTesting; }
      initialization ||= sdk.initialize({ initializeForTesting: !!ad.isTesting }).catch(error => { initialization = null; throw error; });
      await initialization;
    } else await sdk.initialize({ initializeForTesting: !!ad.isTesting });
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
        await sdk.prepareRewardVideoAd({ adId: ad.adId, isTesting: !!ad.isTesting, npa: true, ...(ad.id ? {ssv:{customData:ad.id}} : {}) });
        if (!settled) sdk.showRewardVideoAd().catch(error => finish(error));
      })().catch(error => finish(error));
    });
  } finally {
    clearTimeout(timer);
    await Promise.allSettled(listeners.map(listener => listener.remove()));
  }
}

export async function openAndroidAdPrivacy({enabled=Capacitor.getPlatform()==='android',sdk=AdMob}={}){
  if(!enabled)throw new Error('Android 앱에서 이용해 주세요.');
  const consent=await sdk.requestConsentInfo();
  if(consent.privacyOptionsRequirementStatus==='NOT_REQUIRED')return false;
  if(consent.privacyOptionsRequirementStatus!=='REQUIRED')throw new Error('광고 동의 상태를 확인하지 못했어요.');
  await sdk.showPrivacyOptionsForm();
  return true;
}
