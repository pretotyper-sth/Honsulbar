import {AppError,sbUrl,database} from './platform.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function playReviewReady(env=process.env){
 return env.HB_PLAY_REVIEW_ENABLED==='1'&&uuid.test(env.HB_PLAY_REVIEW_AUTH_USER_ID||'')&&uuid.test(env.HB_PLAY_REVIEW_MEMBER_ID||'');
}
export async function playReviewMember(accessToken,{env=process.env,fetcher=fetch,db=database,base=sbUrl()}={}){
 if(!playReviewReady(env))throw new AppError('Review access is unavailable.',503);
 if(typeof accessToken!=='string'||accessToken.length<20||accessToken.length>8192)throw new AppError('Check your review credentials.',401);
 const key=env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
 if(!base.startsWith('https://')||!key)throw new AppError('Review access is unavailable.',503);
 let response;
 try{response=await fetcher(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(10000)});}catch{throw new AppError('Please try again later.',503);}
 const user=await response.json().catch(()=>null);
 if(!response.ok||user?.id!==env.HB_PLAY_REVIEW_AUTH_USER_ID||user?.is_anonymous||!user?.email_confirmed_at||!user.identities?.some(i=>i.provider==='email'))throw new AppError('Check your review credentials.',401);
 const mid=env.HB_PLAY_REVIEW_MEMBER_ID;
 const owners=await db(`hb_login_identities?auth_user_id=eq.${user.id}&select=member_id,provider`);
 // Never bind a password account to an arbitrary member or a shared Auth account.
 if(!owners.some(i=>i.provider==='play-review')||owners.some(i=>i.member_id!==mid))throw new AppError('Review account is not ready.',403);
 const [member]=await db(`hb_members?id=eq.${mid}&select=id,banned_until`);
 if(!member?.id||(member.banned_until&&new Date(member.banned_until)>new Date()))throw new AppError('Review account is not ready.',403);
 // Admission still uses the normal DB adult/photo gates; this route grants no checks.
 return mid;
}
