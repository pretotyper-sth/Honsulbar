import { AppError, database, rpc } from './platform.js';

const demo = 'ca-app-pub-3940256099942544/5224354917';
export function androidAdsConfiguration(member, env = process.env) {
  const mode = env.HB_ANDROID_ADS_MODE;
  const testers = (env.HB_ANDROID_TEST_MEMBER_IDS || env.HB_PLAY_TEST_MEMBER_IDS || '').split(',').map(value => value.trim());
  if (mode === 'test' && testers.includes(member)) return { enabled:true, isTesting:true, adId:demo };
  if (mode === 'live' && /^ca-app-pub-\d+\/\d+$/.test(env.HB_ADMOB_REWARD_UNIT_ID || '') && !env.HB_ADMOB_REWARD_UNIT_ID.startsWith('ca-app-pub-3940256099942544/')) return { enabled:true, isTesting:false, adId:env.HB_ADMOB_REWARD_UNIT_ID };
  return { enabled:false };
}
export async function startAndroidAd(member, {env=process.env,run=rpc}={}) {
  const config = androidAdsConfiguration(member,env);
  if (!config.enabled) throw new AppError('광고 설정을 준비 중이에요.',503);
  const id = await run('hb_start_android_ad',{p_member:member,p_mode:config.isTesting?'test':'live',p_unit:config.adId.split('/')[1]});
  return {...config,id};
}
export async function finishAndroidAd(member, id, {env=process.env,db=database,run=rpc}={}) {
  if (!/^[\da-f-]{36}$/.test(id || '')) throw new AppError('광고 시청 정보를 확인해 주세요.',400);
  const [claim] = await db(`hb_ad_claims?id=eq.${id}&member_id=eq.${member}&select=id`);
  if (!claim) throw new AppError('광고 시청 정보를 확인해 주세요.',403);
  const [ad] = await db(`hb_android_ad_claims?id=eq.${id}&select=mode,ad_unit,verified_at`);
  if (!ad) throw new AppError('광고 시청 정보를 확인해 주세요.',403);
  if (ad.mode === 'test') {
    const config = androidAdsConfiguration(member,env);
    if (!config.enabled || !config.isTesting) throw new AppError('테스트 광고 대상 계정이 아니에요.',403);
    await run('hb_complete_android_ad',{p_claim:id,p_unit:ad.ad_unit,p_transaction:null,p_timestamp:Date.now(),p_test:true});
    return {verified:true,testReward:true};
  }
  return {verified:!!ad.verified_at,pending:!ad.verified_at};
}
