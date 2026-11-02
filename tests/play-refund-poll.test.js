import test from 'node:test';
import assert from 'node:assert/strict';
import {pollPlayRefunds} from '../server/play-refund-poll.js';
import {hash} from '../server/platform.js';
const env={HB_PLAY_REFUND_POLL_ENABLED:'1',HB_PLAY_PACKAGE_NAME:'com.honsulbar.app',HB_PLAY_SERVICE_ACCOUNT_JSON:'fixture'};
const token='fixture-purchase-token-123';
const order=`play:${hash(`com.honsulbar.app:${token}`)}`;
test('refund polling is off by default and checks configuration before contacting Google',async()=>{
 assert.deepEqual(await pollPlayRefunds({env:{},request:()=>assert.fail('disabled')}),{enabled:false});
 await assert.rejects(pollPlayRefunds({env:{HB_PLAY_REFUND_POLL_ENABLED:'1'},request:()=>assert.fail('unconfigured')}),/not_configured/);
});
test('polling follows pages, deduplicates refunds and only queues known credited orders',async()=>{
 const requests=[],writes=[];
 const result=await pollPlayRefunds({env,request:async path=>{
  const query=new URL('https://fixture.test/'+path).searchParams;requests.push(query);
  assert.equal(query.get('type'),'0');assert.equal(query.get('includeQuantityBasedPartialRefund'),'true');
  return query.has('token')?{voidedPurchases:[{purchaseToken:token},{purchaseToken:'unregistered-token-123'}]}:{voidedPurchases:[{purchaseToken:token}],tokenPagination:{nextPageToken:'next/page=='}};
 },db:async path=>path.includes(order)?[{order_id:order,status:'paid'}]:[],run:async(name,args)=>writes.push({name,args})});
 assert.equal(result.reviewed,1);assert.equal(requests[1].get('token'),'next/page==');
 assert.deepEqual(writes,[{name:'hb_review_play_refund',args:{p_order:order}}]);
 assert.ok(!JSON.stringify(writes).includes(token));
});
test('a failed refund does not block later refunds and incomplete scans never report success',async()=>{
 let writes=0;
 await assert.rejects(pollPlayRefunds({env,request:async()=>({voidedPurchases:[{purchaseToken:'bad'},{purchaseToken:token}]}),db:async()=>[{status:'paid'}],run:async()=>{writes++;}}),/retry_required/);
 assert.equal(writes,1);
 await assert.rejects(pollPlayRefunds({env,request:async()=>({tokenPagination:{nextPageToken:'more'}})}),/retry_required/);
 await assert.rejects(pollPlayRefunds({env,request:async()=>({voidedPurchases:{}})}),/invalid_response/);
 await pollPlayRefunds({env,request:async()=>({voidedPurchases:[{purchaseToken:token}]}),db:async()=>[{status:'refund_review'}],run:()=>assert.fail('already queued')});
});
