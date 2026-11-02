import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { verifyAdmobCallback } from '../server/admob-ssv.js';
import { androidAdsConfiguration, finishAndroidAd } from '../server/android-ads.js';

const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const keys=[{keyId:7,pem:publicKey.export({type:'spki',format:'pem'})}];
const claim='00000000-0000-4000-8000-000000000001';
const now=Date.now();
const content=`ad_network=5450213213286189855&ad_unit=123456789&custom_data=${claim}&reward_amount=1&reward_item=points&timestamp=${now}&transaction_id=abcdef123456`;
const signed=data=>`${data}&signature=${sign('sha256',Buffer.from(data),privateKey).toString('base64url')}&key_id=7`;
test('SSV validates exact signed bytes, rejects tampering/duplicate parameters/expired callbacks',async()=>{
  assert.equal((await verifyAdmobCallback(signed(content),{keys,now})).claim,claim);
  await assert.rejects(verifyAdmobCallback(signed(content).replace('reward_amount=1','reward_amount=9999'),{keys,now}));
  await assert.rejects(verifyAdmobCallback(signed(content+'&custom_data='+claim),{keys,now}));
  await assert.rejects(verifyAdmobCallback(signed(content),{keys,now:now+86400001}));
  await assert.rejects(verifyAdmobCallback(signed(content)+'&reward_amount=9999',{keys,now}));
});
test('only listed testers can claim demo rewards, and live rewards cannot be completed by the client',async()=>{
  const env={HB_ANDROID_ADS_MODE:'test',HB_ANDROID_TEST_MEMBER_IDS:'tester'};
  assert.equal(androidAdsConfiguration('stranger',env).enabled,false);
  assert.equal(androidAdsConfiguration('tester',env).isTesting,true);
  let granted=false;
  const db=async path=>path.startsWith('hb_ad_claims?')?[{id:claim}]:[{mode:'live',ad_unit:'123456789',verified_at:null}];
  const result=await finishAndroidAd('tester',claim,{env,db,run:async()=>{granted=true;}});
  assert.equal(result.pending,true);assert.equal(granted,false);
  await assert.rejects(finishAndroidAd('stranger',claim,{env,db:async path=>path.startsWith('hb_ad_claims?')?[{id:claim}]:[{mode:'test',ad_unit:'123456789'}]}),/대상 계정/);
});
test('reward SQL grants once per claim/day and rejects a reused Google transaction or mismatched unit',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;');
    for (const name of ['20260924_toss_login_disconnect.sql','20260924_service_backend.sql','20260924_admin_ops.sql','20260926_rejoin_visit.sql','20261012_safety_automation.sql','20261016_face_verification.sql','20261102_android_ads.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    const member=(await db.query("select hb_login('12345') as id")).rows[0].id;
    const create=async()=>{
      const id=(await db.query('insert into hb_ad_claims(member_id) values($1) returning id',[member])).rows[0].id;
      await db.query("insert into hb_android_ad_claims(id,mode,ad_unit) values($1,'live','123456789')",[id]);return id;
    };
    const complete=(id,transaction,unit='123456789')=>db.query('select hb_complete_android_ad($1,$2,$3,$4,false)',[id,unit,transaction,Date.now()]);
    const id=await create();await assert.rejects(complete(id,'abcdef123456','wrong'));
    await complete(id,'abcdef123456');await complete(id,'abcdef123456');
    const second=await create();await assert.rejects(complete(second,'abcdef123456'));
    await complete(second,'abcdef654321');
    assert.equal((await db.query('select balance from hb_members where id=$1',[member])).rows[0].balance,3000);
    assert.equal((await db.query("select count(*)::int as n from hb_ledger where reference like 'attendance:%'")).rows[0].n,1);
  } finally {await db.close();}
});
