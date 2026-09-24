import https from 'node:https';
import { createHash, createHmac, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const hash = value => createHash('sha256').update(value).digest('hex');
export const signPhoto = (id,v) => createHmac('sha256',`photo:${process.env.SUPABASE_SERVICE_ROLE_KEY||''}`).update(`${id}.${v}`).digest('base64url').slice(0,22);
export const photoMatches = (id,v,s) => typeof s==='string'&&s.length===22&&timingSafeEqual(Buffer.from(s),Buffer.from(signPhoto(id,v)));
const DEFAULT_PRODUCTS = {
  honsulbar_p1000: {points:1000,won:1000},
  honsulbar_p3300: {points:3300,won:3000},
  honsulbar_p6500: {points:6500,won:5500},
  honsulbar_p10000: {points:10000,won:8000},
  honsulbar_p20000: {points:20000,won:15000},
};
export function skuPoints() {
 try{const value=JSON.parse(process.env.TOSS_IAP_PRODUCTS||'{}');if(value&&typeof value==='object'&&Object.keys(value).length)return value;}catch{}
 return DEFAULT_PRODUCTS;
}
export const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id';
export function rewardedAdGroupId() {
 return process.env.TOSS_REWARDED_AD_GROUP_ID || TEST_REWARDED_AD_GROUP_ID;
}
export const newToken = () => randomBytes(32).toString('base64url');
export const sbUrl = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/,'');
export async function database(path,{method='GET',body,headers={}}={}) {
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!sbUrl()||!key) throw new AppError('서비스 연결을 준비 중이에요. 잠시 후 다시 시도해 주세요.',503);
 const response=await fetch(`${sbUrl()}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const text=await response.text(); let data; try{data=text?JSON.parse(text):null;}catch{data=null;}
 if(!response.ok) throw new AppError(data?.code==='P0001'?data.message:'요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',data?.code==='P0001'?400:503);
 return data;
}
export const rpc = (name,body) => database(`rpc/${name}`,{method:'POST',body});
export async function authenticate(req) {
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!/^[\w-]{43}$/.test(token)) throw new AppError('로그인이 필요해요.',401);
 const sessions=await database(`hb_sessions?token_hash=eq.${hash(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=member_id&limit=1`);
 if(!sessions?.length) throw new AppError('다시 로그인해 주세요.',401);
 return sessions[0].member_id;
}
export async function admin(req) {
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!token) throw new AppError('관리자 로그인이 필요해요.',401);
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const r=await fetch(`${sbUrl()}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
 const user=await r.json();
 const allowed=(process.env.ADMIN_EMAILS||'pretotyper.sth@gmail.com').split(',').map(v=>v.trim().toLowerCase());
 if(!r.ok||!user.email_confirmed_at||!allowed.includes(user.email?.toLowerCase())) throw new AppError('관리자 권한이 없어요.',403);
 return user.email;
}
export function decryptField(value) {
 const key=Buffer.from(process.env.TOSS_DECRYPTION_KEY||'','base64');
 if(key.length!==32||!process.env.TOSS_AAD) throw new AppError('로그인 정보 복호화 설정이 필요해요.',503);
 const buf=Buffer.from(value,'base64');
 if(buf.length<29) throw new AppError('사용자 정보를 확인하지 못했어요.',401);
 const decipher=createDecipheriv('aes-256-gcm',key,buf.subarray(0,12));
 decipher.setAuthTag(buf.subarray(-16));decipher.setAAD(Buffer.from(process.env.TOSS_AAD,'utf8'));
 return Buffer.concat([decipher.update(buf.subarray(12,-16)),decipher.final()]).toString('utf8');
}
export function isAdult(birthday,now=new Date()) {
 const clean=String(birthday).replace(/-/g,'');
 if(!/^\d{8}$/.test(clean)) return false;
 const y=Number(clean.slice(0,4)),m=Number(clean.slice(4,6)),d=Number(clean.slice(6));
 const birth=new Date(Date.UTC(y,m-1,d));
 if(birth.getUTCFullYear()!==y||birth.getUTCMonth()!==m-1||birth.getUTCDate()!==d)return false;
 const today=new Date(now.getTime()+9*3600000);
 const age=today.getUTCFullYear()-y-((today.getUTCMonth()+1<m||(today.getUTCMonth()+1===m&&today.getUTCDate()<d))?1:0);
 return age>=19&&age<130;
}
export async function toss(path,body,headers={}) {
 const cert=process.env.TOSS_CLIENT_CERT_BASE64,key=process.env.TOSS_CLIENT_KEY_BASE64;
 if(!cert||!key) throw new AppError('토스 연결 설정이 아직 완료되지 않았어요.',503);
 return new Promise((resolve,reject)=>{
 const request=https.request(`https://apps-in-toss-api.toss.im${path}`,{method:body===undefined?'GET':'POST',cert:Buffer.from(cert,'base64'),key:Buffer.from(key,'base64'),headers:{'Content-Type':'application/json',...headers},timeout:10000},response=>{
 let text='';response.on('data',chunk=>{text+=chunk;if(text.length>1000000)request.destroy();});response.on('end',()=>{
 try{const data=JSON.parse(text);if(response.statusCode>=400||data.resultType!=='SUCCESS')throw new Error();resolve(data.success);}catch{reject(new AppError('토스 요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',502));}
 });});request.on('timeout',()=>request.destroy());request.on('error',()=>reject(new AppError('토스 연결을 확인해 주세요.',502)));if(body!==undefined)request.write(JSON.stringify(body));request.end();
 });
}
export async function dispatchOutbox() {
 const jobs=await rpc('hb_claim_outbox',{});
 for(const job of jobs||[]) {
  const emailReady=process.env.RESEND_API_KEY&&process.env.SUPPORT_FROM_EMAIL;
  const template=job.data.kind==='available'?process.env.TOSS_PUSH_AVAILABLE_TEMPLATE:process.env.TOSS_PUSH_REPLY_TEMPLATE;
  if((job.kind==='email'&&!emailReady)||(job.kind==='push'&&(!template||!process.env.TOSS_CLIENT_CERT_BASE64))) {
   await database(`hb_outbox?id=eq.${job.id}`,{method:'PATCH',body:{attempts:job.attempts-1,locked_until:null,next_attempt_at:new Date(Date.now()+3600000).toISOString(),last_error:'configuration_required'}}); continue;
  }
  try{
   if(job.kind==='email') {
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:process.env.SUPPORT_FROM_EMAIL,to:['pretotyper.sth@gmail.com'],subject:'[혼술바] 새 문의가 접수되었습니다',text:`새 문의 번호: ${job.data.ticketId}\n관리자 화면에서 내용을 확인하고 답변해 주세요.\nhttps://honsulbar-app.vercel.app/?admin=1`}),signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('delivery_failed');
   }else{
    const [m]=await database(`hb_members?id=eq.${job.data.memberId}&select=toss_key`);
    if(m)await toss('/api-partner/v1/apps-in-toss/messenger/send-message',{templateSetCode:template,context:{}},{'x-toss-user-key':m.toss_key});
   }
   await database(`hb_outbox?id=eq.${job.id}`,{method:'PATCH',body:{sent_at:new Date().toISOString(),locked_until:null,last_error:null}});
  }catch{
   await database(`hb_outbox?id=eq.${job.id}`,{method:'PATCH',body:{locked_until:null,last_error:'delivery_failed',next_attempt_at:new Date(Date.now()+Math.min(86400000,60000*2**job.attempts)).toISOString()}});
  }
 }
}
