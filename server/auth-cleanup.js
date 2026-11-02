import {createHmac} from 'node:crypto';
import {database,rpc,sbUrl} from './platform.js';
export async function cleanupAuthUsers({env=process.env,db=database,run=rpc,send=fetch,url=sbUrl()}={}){
 if(env.HB_AUTH_CLEANUP_ENABLED!=='1')return {enabled:false};
 if(!url.startsWith('https://')||!env.SUPABASE_SERVICE_ROLE_KEY||(env.HB_IDENTITY_HASH_KEY||'').length<32)throw Error('auth_cleanup_not_configured');
 const jobs=await db('hb_auth_cleanup?status=in.(pending,deleting,retained)&next_attempt_at=lte.'+encodeURIComponent(new Date().toISOString())+'&order=next_attempt_at.asc&limit=5');
 let completed=0,failed=0;
 for(const job of jobs){
  try{
   if(!/^[a-f0-9-]{36}$/.test(job.auth_user_id))throw Error();
   const endpoint=`${url}/auth/v1/admin/users/${job.auth_user_id}`;
   const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
   const response=await send(endpoint,{headers,signal:AbortSignal.timeout(10000)});
   let hashes=[];
   if(response.status!==404){
    if(!response.ok)throw Error();
    const user=await response.json();
    if(user.id!==job.auth_user_id||!Array.isArray(user.identities))throw Error();
    // All remote identities are checked, including ones never recorded by this service.
    for(const identity of user.identities){
     if(!['google','kakao'].includes(identity.provider)||!identity.identity_data?.sub)throw Error();
     hashes.push(createHmac('sha256',env.HB_IDENTITY_HASH_KEY).update(`social:${identity.provider}:${identity.identity_data.sub}`).digest('hex'));
    }
   }
   if(!await run('hb_claim_auth_cleanup',{p_auth_user:job.auth_user_id,p_subject_hashes:hashes}))continue;
   if(response.status!==404){
    const removed=await send(endpoint,{method:'DELETE',headers,signal:AbortSignal.timeout(10000)});
    if(!removed.ok&&removed.status!==404)throw Error();
   }
   await db(`hb_auth_cleanup?auth_user_id=eq.${job.auth_user_id}`,{method:'PATCH',body:{status:'done',updated_at:new Date().toISOString()}});completed++;
  }catch{failed++;} // Keep the leased queue entry for retry; never log identities or credentials.
 }
 if(failed)throw Error('auth_cleanup_retry_required');
 return {enabled:true,completed};
}
