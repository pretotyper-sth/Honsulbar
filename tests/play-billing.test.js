import test from 'node:test';
import assert from 'node:assert/strict';
import { playBillingConfiguration, processPlayPurchase, validatePlayPurchase, validatePlaySubscription, processPlaySubscription } from '../server/play-billing.js';
import { purchasePlayPoints, recoverPlayPurchases, purchasePlaySubscription } from '../src/play-billing.js';

const member = '00000000-0000-4000-8000-000000000001';
const env = { HB_PLAY_PACKAGE_NAME:'com.honsulbar.android', HB_PLAY_SERVICE_ACCOUNT_JSON:'configured', HB_IDENTITY_HASH_KEY:'x'.repeat(32), HB_PLAY_LICENSE_TESTERS_CONFIRMED:'1', HB_PLAY_TEST_MEMBER_IDS:member };
const config = playBillingConfiguration(member, env);
const receipt = () => ({ purchaseStateContext:{purchaseState:'PURCHASED'}, obfuscatedExternalAccountId:config.accountId, testPurchaseContext:{fopType:'TEST'}, productLineItem:[{productId:'honsulbar_p1000', productOfferDetails:{quantity:1,refundableQuantity:1,consumptionState:'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}] });
const input = { productId:'honsulbar_p1000', purchaseToken:'purchase_token_for_testing' };

test('Play checkout stays off until credentials, package and confirmed license-test member are configured', () => {
  assert.equal(playBillingConfiguration(member, {}).enabled, false);
  assert.equal(playBillingConfiguration('another-member', env).enabled, false);
  assert.equal(playBillingConfiguration(member, {...env,HB_PLAY_LICENSE_TESTERS_CONFIRMED:'0'}).enabled,false);
  assert.equal(config.enabled,true);
  assert.match(config.accountId,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(config).includes('configured'));
});
test('Play server rejects pending/cancelled, wrong owner, live test payments, mismatched products and quantities', () => {
  const options = {productId:input.productId,accountId:config.accountId,testOnly:true};
  for (const state of ['PENDING','CANCELLED','PURCHASE_STATE_UNSPECIFIED']) assert.throws(()=>validatePlayPurchase({...receipt(),purchaseStateContext:{purchaseState:state}},options));
  assert.throws(()=>validatePlayPurchase({...receipt(),obfuscatedExternalAccountId:'someone-else'},options));
  assert.throws(()=>validatePlayPurchase({...receipt(),testPurchaseContext:undefined},options));
  for (const mutation of [data=>{data.productLineItem[0].productId='honsulbar_p20000';},data=>{data.productLineItem[0].productOfferDetails.quantity=2;},data=>{data.productLineItem[0].productOfferDetails.refundableQuantity=0;}]) {
    const data=receipt();mutation(data);assert.throws(()=>validatePlayPurchase(data,options));
  }
});
test('server validates with Google before credit; consumes only after the durable ledger grant', async () => {
  const steps=[];
  const result=await processPlayPurchase(member,input,{env,db:async()=>[],run:async(name,args)=>{steps.push('credit');assert.equal(name,'hb_credit_order');assert.equal(args.p_points,1000);assert.match(args.p_order,/^play:[a-f0-9]{64}$/);},request:async(path,method)=>{steps.push(method==='POST'?'consume':'verify');assert.ok(path.startsWith('com.honsulbar.android/'));return receipt();}});
  assert.deepEqual(steps,['verify','credit','consume']);assert.equal(result.testPurchase,true);
  await assert.rejects(processPlayPurchase(member,input,{env,db:async()=>[],request:async()=>receipt(),run:async()=>{throw Error('DB unavailable');}}),/DB unavailable/);
});
test('consumed purchases must already belong to this member; a retry reuses the same ledger identity', async () => {
  const data=receipt();data.productLineItem[0].productOfferDetails.consumptionState='CONSUMPTION_STATE_CONSUMED';
  const base={env,request:async()=>data,run:async()=>{}};
  await assert.rejects(processPlayPurchase(member,input,{...base,db:async()=>[]}),/이미 사용/);
  await assert.rejects(processPlayPurchase(member,input,{...base,db:async()=>[{member_id:'other',sku:input.productId}]}),/다른 계정/);
  assert.equal((await processPlayPurchase(member,input,{...base,db:async()=>[{member_id:member,sku:input.productId}]})).verified,true);
});
test('native purchase sends only token/product to server and never auto-consumes an unverified purchase', async () => {
  const calls=[];
  const sdk={configure:async options=>assert.equal(options.autoFinishTransactions,false),getProducts:async()=>({products:[{identifier:input.productId,currencyCode:'KRW',price:1100}]}),purchaseProduct:async options=>{assert.equal(options.appAccountToken,config.accountId);assert.equal(options.autoAcknowledgePurchases,false);return {...input,purchaseState:'1'};}};
  await purchasePlayPoints(config,1000,async body=>calls.push(body),{sdk,enabled:true});
  assert.deepEqual(calls,[input]);
  sdk.purchaseProduct=async()=>({...input,purchaseState:'2'});
  await assert.rejects(purchasePlayPoints(config,1000,async()=>{throw Error('must not verify');},{sdk,enabled:true}),/아직 완료/);
});
test('purchase recovery skips pending/unknown products and verifies completed purchases',async()=>{
  const calls=[];
  const sdk={configure:async()=>{},getPurchases:async()=>({purchases:[{...input,productIdentifier:input.productId,purchaseState:'1'},{...input,productIdentifier:input.productId,purchaseState:'2'},{...input,productIdentifier:'unknown',purchaseState:'1'}]})};
  await recoverPlayPurchases(config,async data=>calls.push(data),{sdk,enabled:true});
  assert.deepEqual(calls,[input]);
});

function subscription(state = 'SUBSCRIPTION_STATE_ACTIVE') {
  return {subscriptionState:state,externalAccountIdentifiers:{obfuscatedExternalAccountId:config.accountId},testPurchase:{},acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:config.subscription.productId,expiryTime:'2030-01-01T00:00:00Z',autoRenewingPlan:{autoRenewEnabled:true}}]};
}
test('subscription cancellation keeps paid access until expiry; hold, paused, expired and pending do not grant access',()=>{
  const options={productId:config.subscription.productId,accountId:config.accountId,testOnly:true,now:Date.parse('2026-11-02T00:00:00Z')};
  assert.equal(validatePlaySubscription(subscription(),options).autoRenew,true);
  const cancelled=validatePlaySubscription(subscription('SUBSCRIPTION_STATE_CANCELED'),options);
  assert.equal(cancelled.access,true);assert.equal(cancelled.autoRenew,false);
  for (const state of ['SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_EXPIRED']) assert.equal(validatePlaySubscription(subscription(state),options).access,false);
  assert.throws(()=>validatePlaySubscription(subscription('SUBSCRIPTION_STATE_PENDING'),options));
  assert.equal(validatePlaySubscription(subscription(),{...options,now:Date.parse('2031-01-01T00:00:00Z')}).access,false);
  const live=subscription();delete live.testPurchase;assert.throws(()=>validatePlaySubscription(live,options),/무료 테스트/);
});
test('subscription server verifies account and durable entitlement before acknowledgment',async()=>{
  const steps=[];
  const body={productId:config.subscription.productId,purchaseToken:input.purchaseToken};
  const result=await processPlaySubscription(member,body,{env,db:async()=>[],run:async(name,args)=>{assert.equal(name,'hb_apply_subscription');assert.equal(args.p_access,true);steps.push('entitlement');},request:async(path,method)=>{steps.push(method==='POST'?'acknowledge':'verify');return subscription();}});
  assert.equal(result.access,true);assert.deepEqual(steps,['verify','entitlement','acknowledge']);
});
test('subscription SDK selects the configured base plan and disables auto-acknowledgment',async()=>{
  const sdk={configure:async()=>{},getProducts:async()=>({products:[{identifier:'monthly',planIdentifier:'honsulbar_monthly',offerToken:'offer',currencyCode:'KRW',price:13200}]}),purchaseProduct:async options=>{assert.equal(options.planIdentifier,'monthly');assert.equal(options.productIdentifier,'honsulbar_monthly');assert.equal(options.autoAcknowledgePurchases,false);return {...input,purchaseState:'1'};}};
  let validated;
  await purchasePlaySubscription(config,async data=>{validated=data;},{sdk,enabled:true});
  assert.equal(validated.productId,'honsulbar_monthly');
  await assert.rejects(purchasePlaySubscription({...config,checkoutAllowed:false},async()=>{},{sdk,enabled:true}),/安全|안전/);
});

test('one rejected receipt does not starve remaining points or subscription recovery and failures remain retryable',async()=>{
 const {recoverPlayBilling}=await import('../src/play-billing.js');
 const seen=[];const sdk={configure:async()=>{},getPurchases:async({productType})=>({purchases:productType==='inapp'?[{productIdentifier:input.productId,purchaseState:'1',purchaseToken:'failed-token'},{productIdentifier:input.productId,purchaseState:'1',purchaseToken:'valid-token'}]:[{productIdentifier:config.subscription.productId,purchaseState:'1',purchaseToken:'subscription-token'}]})};
 const points=async body=>{seen.push(body.purchaseToken);if(body.purchaseToken==='failed-token')throw Error('transient failure');};
 const sub=async body=>seen.push(body.purchaseToken);
 for(let i=0;i<2;i++)await assert.rejects(recoverPlayBilling(config,points,sub,{sdk,enabled:true}),AggregateError);
 assert.deepEqual(seen,['failed-token','valid-token','subscription-token','failed-token','valid-token','subscription-token']);
});
test('store query failure for point purchases still allows subscription recovery',async()=>{
 const {recoverPlayBilling}=await import('../src/play-billing.js');let checked=false;
 const sdk={configure:async()=>{},getPurchases:async({productType})=>{if(productType==='inapp')throw Error('store query unavailable');return {purchases:[{productIdentifier:config.subscription.productId,purchaseState:'1',purchaseToken:'subscription-token'}]};}};
 await assert.rejects(recoverPlayBilling(config,()=>assert.fail('no points'),async()=>{checked=true;},{sdk,enabled:true}),AggregateError);
 assert.equal(checked,true);
});
test('successful recovery resolves after checking both product types, including empty purchase lists',async()=>{
 const {recoverPlayBilling}=await import('../src/play-billing.js');
 for(const empty of [true,false]){
  const seen=[];const sdk={configure:async()=>{},getPurchases:async({productType})=>({purchases:empty?[]:[{productIdentifier:productType==='inapp'?input.productId:config.subscription.productId,purchaseState:'1',purchaseToken:'valid-token'}]})};
  await recoverPlayBilling(config,async()=>seen.push('points'),async()=>seen.push('subscription'),{sdk,enabled:true});
  assert.deepEqual(seen,empty?[]:['points','subscription']);
 }
});
