import test from 'node:test';import assert from 'node:assert/strict';
import {verifyPlayNotification,processPlayNotification} from '../server/play-notifications.js';
const env={HB_PLAY_NOTIFICATIONS_ENABLED:'1',HB_PLAY_NOTIFICATION_EMAIL:'push@example.iam.gserviceaccount.com',HB_PLAY_NOTIFICATION_AUDIENCE:'https://example.test/api/play-notifications',HB_PLAY_PACKAGE_NAME:'com.honsulbar.app'};
const claims=()=>({email:env.HB_PLAY_NOTIFICATION_EMAIL,email_verified:true,aud:env.HB_PLAY_NOTIFICATION_AUDIENCE,iss:'https://accounts.google.com'});
const token='fixture-purchase-token';const envelope=extra=>({message:{messageId:'123',data:Buffer.from(JSON.stringify({packageName:env.HB_PLAY_PACKAGE_NAME,...extra})).toString('base64')}});
test('Play push requires configured Google signature, exact audience and verified service-account email',async()=>{
 const verify=async options=>{assert.equal(options.audience,env.HB_PLAY_NOTIFICATION_AUDIENCE);return {getPayload:claims};};
 await verifyPlayNotification('Bearer signed.jwt.token',env,verify);
 await assert.rejects(verifyPlayNotification('Bearer signed.jwt.token',{},verify),e=>e.status===503);
 await assert.rejects(verifyPlayNotification('',env,verify),e=>e.status===401);
 for(const change of [{email:'other@example.test'},{email_verified:false},{aud:'https://evil.test'},{iss:'https://evil.test'}])await assert.rejects(verifyPlayNotification('Bearer signed.jwt.token',env,async()=>({getPayload:()=>({...claims(),...change})})),e=>e.status===401);
 await assert.rejects(verifyPlayNotification('Bearer signed.jwt.token',env,async()=>{throw Error('signature');}),e=>e.status===401);
});
test('subscription push uses durable order owner and queries current state instead of trusting notification type',async()=>{
 let calls=0;const options={env,db:async path=>{assert.match(path,/order_id=eq.play-sub:[a-f0-9]{64}/);return [{member_id:'owner',sku:'honsulbar_monthly'}];},subscription:async(member,body)=>{calls++;assert.equal(member,'owner');assert.deepEqual(body,{productId:'honsulbar_monthly',purchaseToken:token});return {access:false};}};
 for(const notificationType of [1,2,3,12,13])assert.deepEqual(await processPlayNotification(envelope({subscriptionNotification:{notificationType,purchaseToken:token}}),options),{verified:true,access:false});
 assert.equal(calls,5);
 assert.deepEqual(await processPlayNotification(envelope({voidedPurchaseNotification:{productType:1,purchaseToken:token}}),options),{verified:true,access:false});
 await assert.rejects(processPlayNotification(envelope({subscriptionNotification:{purchaseToken:token}}),{...options,db:async()=>[]}),e=>e.status===503);
 await assert.rejects(processPlayNotification(envelope({subscriptionNotification:{purchaseToken:token}}),{...options,subscription:async()=>{throw Error('Google unavailable');}}),/Google unavailable/);
});
test('test push cannot grant credit; malformed, wrong-app and unsupported refund events are not acknowledged as processed',async()=>{
 const options={env,db:()=>assert.fail('no DB'),subscription:()=>assert.fail('no purchase')};
 assert.deepEqual(await processPlayNotification(envelope({testNotification:{}}),options),{test:true});
 for(const body of [{},'{bad',envelope({packageName:'other'}),envelope({voidedPurchaseNotification:{purchaseToken:token}})])await assert.rejects(processPlayNotification(body,options));
});
test('point refunds queue the hashed purchase for review without granting or deducting points',async()=>{
 const calls=[];
 assert.deepEqual(await processPlayNotification(envelope({voidedPurchaseNotification:{productType:2,purchaseToken:token}}),{env,run:async(name,args)=>{calls.push(name);assert.equal(name,'hb_review_play_refund');assert.match(args.p_order,/^play:[a-f0-9]{64}$/);assert.ok(!args.p_order.includes(token));},subscription:()=>assert.fail('not a subscription')}),{reviewRequired:true});
 assert.equal(calls.length,1);
 await assert.rejects(processPlayNotification(envelope({voidedPurchaseNotification:{productType:2,purchaseToken:token}}),{env,run:async()=>{throw Error('database unavailable');}}),/database unavailable/);
});
