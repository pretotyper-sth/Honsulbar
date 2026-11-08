import test from 'node:test';
import assert from 'node:assert/strict';
import { RewardAdPluginEvents as Events } from '@capacitor-community/admob';
import { showAndroidTestReward, TEST_REWARD_AD_ID } from '../src/android-test-ads.js';

function fakeSdk(show, prepare = async () => {}) {
  const callbacks = new Map(), removed = [];
  const sdk = {
    initialize: async options => assert.equal(options.initializeForTesting, true),
    addListener: async (event, fn) => { callbacks.set(event, fn); return { remove: async () => removed.push(event) }; },
    prepareRewardVideoAd: async options => {
      assert.deepEqual(options, { adId: TEST_REWARD_AD_ID, isTesting: true, npa: true });
      await prepare();
    },
    showRewardVideoAd: async () => show(callbacks),
  };
  return { sdk, removed };
}

test('only rewarded then dismissed test ads complete; duplicate events do not duplicate completion', async () => {
  const env = fakeSdk(events => {
    events.get(Events.Rewarded)();
    events.get(Events.Rewarded)();
    events.get(Events.Dismissed)();
    events.get(Events.Dismissed)();
  });
  await showAndroidTestReward({ enabled: true, sdk: env.sdk });
  assert.equal(env.removed.length, 3);
});

test('early close, load/show failure and timeout never grant rewards and clean up listeners', async () => {
  const cases = [
    fakeSdk(events => events.get(Events.Dismissed)()),
    fakeSdk(events => events.get(Events.FailedToShow)()),
    fakeSdk(() => { throw Error('show failed'); }),
    fakeSdk(() => {}, async () => { throw Error('load failed'); }),
    fakeSdk(() => new Promise(() => {})),
  ];
  for (const env of cases) {
    await assert.rejects(showAndroidTestReward({ enabled: true, sdk: env.sdk, timeoutMs: 20 }));
    assert.equal(env.removed.length, 3);
  }
});

test('native ads are unavailable unless the Android test path is explicitly enabled', async () => {
  const env = fakeSdk(() => { throw Error('must not show'); });
  await assert.rejects(showAndroidTestReward({ enabled: false, sdk: env.sdk }), /Android 앱/);
  assert.equal(env.removed.length, 0);
});

test('Android privacy settings expose the SDK form only when required, without loading ads or rewarding',async()=>{
 const {openAndroidAdPrivacy}=await import('../src/android-test-ads.js');
 for(const status of ['REQUIRED','NOT_REQUIRED']){
  let forms=0;const sdk={requestConsentInfo:async()=>({privacyOptionsRequirementStatus:status}),showPrivacyOptionsForm:async()=>{forms++;},initialize:()=>assert.fail('no ads'),prepareRewardVideoAd:()=>assert.fail('no ads')};
  assert.equal(await openAndroidAdPrivacy({enabled:true,sdk}),status==='REQUIRED');assert.equal(forms,status==='REQUIRED'?1:0);
 }
 await assert.rejects(openAndroidAdPrivacy({enabled:true,sdk:{requestConsentInfo:async()=>({privacyOptionsRequirementStatus:'UNKNOWN'})}}),/확인하지/);
 await assert.rejects(openAndroidAdPrivacy({enabled:false,sdk:{requestConsentInfo:()=>assert.fail('no SDK')}}),/Android/);
 await assert.rejects(openAndroidAdPrivacy({enabled:true,sdk:{requestConsentInfo:async()=>{throw Error('network');}}}),/network/);
});

test('preloaded reward is shown without a second network load and cannot be reused after display',async()=>{
  const {prepareAndroidReward}=await import('../src/android-test-ads.js');
  let loads=0,shows=0;
  const env=fakeSdk(events=>{shows++;events.get(Events.Rewarded)();events.get(Events.Dismissed)();},async()=>{loads++;});
  const ad={adId:TEST_REWARD_AD_ID,isTesting:true};
  await Promise.all([prepareAndroidReward(ad,{sdk:env.sdk}),prepareAndroidReward(ad,{sdk:env.sdk})]);
  assert.equal(loads,1);assert.equal(shows,0);
  await showAndroidTestReward({enabled:true,sdk:env.sdk});
  assert.equal(loads,1);assert.equal(shows,1);
  await showAndroidTestReward({enabled:true,sdk:env.sdk});
  assert.equal(loads,2);assert.equal(shows,2);
});
