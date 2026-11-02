import {database,hash,rpc} from './platform.js';
import {googleRequest} from './play-billing.js';

// Reuse maintenance without creating a Pub/Sub resource or retaining raw purchase tokens.
export async function pollPlayRefunds({env=process.env,db=database,run=rpc,request=googleRequest}={}) {
  if(env.HB_PLAY_REFUND_POLL_ENABLED!=='1')return {enabled:false};
  if(!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(env.HB_PLAY_PACKAGE_NAME||'')||!env.HB_PLAY_SERVICE_ACCOUNT_JSON)throw Error('play_refund_poll_not_configured');
  let next,reviewed=0,failed=0;
  const seen=new Set();
  // shortcut: at most 2,000 voided purchases in 30 days; add a durable cursor before exceeding this volume.
  for(let page=0;page<2;page++) {
    const query=new URLSearchParams({type:'0',maxResults:'1000',includeQuantityBasedPartialRefund:'true'});
    if(next)query.set('token',next);
    const result=await request(`${encodeURIComponent(env.HB_PLAY_PACKAGE_NAME)}/purchases/voidedpurchases?${query}`);
    if(!result||('voidedPurchases' in result&&!Array.isArray(result.voidedPurchases)))throw Error('play_refund_poll_invalid_response');
    for(const purchase of result.voidedPurchases||[]) {
      try {
        const token=purchase.purchaseToken;
        if(typeof token!=='string'||token.length<16||token.length>8192)throw Error();
        const order=`play:${hash(`${env.HB_PLAY_PACKAGE_NAME}:${token}`)}`;
        if(seen.has(order))continue;
        seen.add(order);
        const [existing]=await db(`hb_orders?order_id=eq.${order}&select=order_id,status`);
        // Google may refund unacknowledged purchases that were never credited here.
        if(!existing||existing.status==='refund_review')continue;
        await run('hb_review_play_refund',{p_order:order});reviewed++;
      }catch{failed++;} // Continue other refunds; do not log provider response, token or order details.
    }
    next=result.tokenPagination?.nextPageToken;
    if(!next)break;
    if(typeof next!=='string'||next.length>8192)throw Error('play_refund_poll_invalid_page');
  }
  if(failed||next)throw Error('play_refund_poll_retry_required');
  return {enabled:true,reviewed};
}
