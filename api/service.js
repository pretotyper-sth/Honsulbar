import {AppError,authenticate,admin,database,rpc,toss,decryptField,isAdult,newToken,hash,dispatchOutbox,sbUrl,signPhoto,photoMatches,skuPoints,rewardedAdGroupId,subscriptionSku,isSubscriptionSku,parseTossTime,pushAvailableTemplate,pushReplyTemplate} from '../server/platform.js';
const allowedActions=new Set(['state','profile','ticket','read','region','waitlist','enter','order','leave','heartbeat','move','request','respond','cancel','focus-end','preview','signal','ad-start','ad-claim']);
const origins=new Set(['https://honsulbar-app.vercel.app','https://honsulbar.apps.tossmini.com','https://honsulbar.private-apps.tossmini.com']);
function withPhotos(value){
 if(Array.isArray(value))return value.map(withPhotos);
 if(!value||typeof value!=='object')return value;
 const out={};
 for(const [k,v] of Object.entries(value))out[k]=k==='photo'&&typeof v==='number'&&value.id?`/api/service?photo=${value.id}&v=${v}&s=${signPhoto(value.id,v)}`:withPhotos(v);
 return out;
}
async function sendPhoto(req,res){
 const {photo:id,v,s}=req.query||{};
 if(!/^[\da-f-]{36}$/.test(id||'')||!/^\d{1,12}$/.test(v||'')||!photoMatches(id,v,s))return res.status(404).end();
 const [m]=await database(`hb_members?id=eq.${id}&select=photo`);
 const match=/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(m?.photo||'');
 if(!match)return res.status(404).end();
 res.setHeader('Content-Type',match[1]);res.setHeader('Cache-Control','public, max-age=31536000, immutable');
 return res.status(200).send(Buffer.from(match[2],'base64'));
}
async function startSession(res,memberId){
 const session=newToken();await database('hb_sessions',{method:'POST',body:{token_hash:hash(session),member_id:memberId}});
 return res.json({token:session,state:withPhotos(await rpc('hb_snapshot',{p_member:memberId}))});
}
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const origin=req.headers.origin;
 const allowed=origins.has(origin)||(process.env.VERCEL_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/.test(origin||''));
 if(origin&&allowed){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
 if(req.method==='OPTIONS')return res.status(204).end();
 if(!['GET','POST'].includes(req.method))return res.status(405).end();
 try{
  if(req.method==='GET'&&req.query?.photo)return await sendPhoto(req,res);
  let body=req.body||{};if(typeof body==='string')body=JSON.parse(body);
  if(JSON.stringify(body).length>1500000)throw new AppError('요청이 너무 커요.',413);
  const action=req.method==='GET'?'config':body.action;
  if(action==='config')return res.json({apiReady:!!(sbUrl()&&process.env.SUPABASE_SERVICE_ROLE_KEY),loginReady:!!(process.env.TOSS_CLIENT_CERT_BASE64&&process.env.TOSS_CLIENT_KEY_BASE64&&process.env.TOSS_DECRYPTION_KEY&&process.env.TOSS_AAD),devLogin:process.env.HB_DEV_LOGIN==='1',supabaseUrl:sbUrl(),supabaseKey:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||'',adGroupId:rewardedAdGroupId(),products:skuPoints(),subscriptionSku:subscriptionSku(),pushAvailableTemplate:pushAvailableTemplate(),pushReplyTemplate:pushReplyTemplate(),iceServers:process.env.WEBRTC_ICE_SERVERS?JSON.parse(process.env.WEBRTC_ICE_SERVERS):[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]});
  if(action==='login'){
   const code=typeof body.authorizationCode==='string'?body.authorizationCode.trim():'';
   const referrer=String(body.referrer||'').trim().toUpperCase();
   if(!code||code.length>8192||!['DEFAULT','SANDBOX'].includes(referrer))throw new AppError('로그인 정보를 확인해 주세요.');
   const token=await toss('/api-partner/v1/apps-in-toss/user/oauth2/generate-token',{authorizationCode:code,referrer});
   const info=await toss('/api-partner/v1/apps-in-toss/user/oauth2/login-me',undefined,{Authorization:`Bearer ${token?.accessToken||token?.access_token||''}`});
   if(!info||!/^\d{1,30}$/.test(String(info.userKey||''))||!info.birthday)throw new AppError('생년월일 동의 후 다시 로그인해 주세요.',403);
   if(!isAdult(decryptField(info.birthday)))throw new AppError('혼술바는 만 19세 이상만 이용할 수 있어요.',403);
   const memberId=await rpc('hb_login',{p_key:String(info.userKey)});
   const [member]=await database(`hb_members?id=eq.${memberId}&select=banned_until`);
   if(member?.banned_until&&new Date(member.banned_until)>new Date())throw new AppError('이용이 제한된 계정이에요.',403);
   await database('toss_login_links?on_conflict=user_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:{user_key:String(info.userKey),is_connected:true,disconnected_at:null}}).catch(()=>{});
   return await startSession(res,memberId);
  }
  if(action==='dev-login'){
   if(process.env.HB_DEV_LOGIN!=='1'||process.env.VERCEL_ENV==='production')throw new AppError('지원하지 않는 요청이에요.',404);
   if(!/^9\d{1,8}$/.test(String(body.key||'')))throw new AppError('테스트 계정을 확인해 주세요.');
   return await startSession(res,await rpc('hb_login',{p_key:String(body.key)}));
  }
  if(action?.startsWith('admin-')){
   const email=await admin(req);
   if(action==='admin-list'){
    const page=Math.max(0,Math.min(10000,Number(body.page)||0));
    const status=['pending','reviewing','answered','closed'].includes(body.status)?`&status=eq.${body.status}`:'';
    const [tickets,outbox,stats]=await Promise.all([
     database(`hb_tickets?select=*&order=created_at.desc&limit=21&offset=${page*20}${status}`),
     database('hb_outbox?sent_at=is.null&select=id,kind,attempts,last_error,created_at&limit=30'),
     rpc('hb_admin_stats').catch(()=>({}))
    ]);
    const ids=[...new Set(tickets.flatMap(t=>[t.member_id,t.target_id]).filter(Boolean))];
    const rows=ids.length?await database(`hb_members?id=in.(${ids.join(',')})&select=id,nickname,gender,banned_until`):[];
    const members=Object.fromEntries((rows||[]).map(m=>[m.id,{id:m.id,nickname:m.nickname,gender:m.gender,banned_until:m.banned_until}]));
    return res.json({tickets:tickets.slice(0,20),hasMore:tickets.length>20,outbox,email,members,stats});
   }
   if(action==='admin-reply'){
    if(!/^[\da-f-]{36}$/.test(body.id)||typeof body.answer!=='string'||!body.answer.trim()||body.answer.length>5000)throw new AppError('답변 내용을 확인해 주세요.');
    const rows=await database(`hb_tickets?id=eq.${body.id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:{answer:body.answer.trim(),answered_by:email,updated_at:new Date().toISOString()}});
    if(!rows.length)throw new AppError('문의를 찾을 수 없어요.',404);
    await dispatchOutbox().catch(()=>{});return res.json({ok:true});
   }
   if(action==='admin-status'){
    if(!/^[\da-f-]{36}$/.test(body.id)||!['pending','reviewing','closed'].includes(body.status))throw new AppError('상태를 확인해 주세요.');
    await database(`hb_tickets?id=eq.${body.id}`,{method:'PATCH',body:{status:body.status,updated_at:new Date().toISOString()}});
    return res.json({ok:true});
   }
   if(action==='admin-restrict'){
    if(!/^[\da-f-]{36}$/.test(body.memberId))throw new AppError('회원을 확인해 주세요.');
    if(!['24h','7d','perm','clear','kick'].includes(body.until))throw new AppError('제한 기간을 확인해 주세요.');
    const reason=typeof body.reason==='string'?body.reason.slice(0,80):'';
    const until={
     '24h':new Date(Date.now()+24*3600*1000).toISOString(),
     '7d':new Date(Date.now()+7*24*3600*1000).toISOString(),
     perm:'9999-12-31T00:00:00.000Z',
     clear:null,
     kick:null
    }[body.until];
    await rpc('hb_restrict',{p_member:body.memberId,p_until:until,p_kick:body.until!=='clear',p_reason:reason,p_set_ban:body.until!=='kick'});
    return res.json({ok:true});
   }
   throw new AppError('지원하지 않는 관리자 요청이에요.');
  }
  const member=await authenticate(req);
  if(action==='logout'){await database(`hb_sessions?token_hash=eq.${hash(req.headers.authorization.slice(7))}`,{method:'DELETE'});return res.json({ok:true});}
  if(action==='withdraw'){
   const [m]=await database(`hb_members?id=eq.${member}&select=toss_key`);
   if(!m.toss_key.startsWith('9')||process.env.HB_DEV_LOGIN!=='1')await toss('/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key',{userKey:Number(m.toss_key)}).catch(()=>{});
   await rpc('apply_toss_login_disconnect',{p_user_key:m.toss_key,p_action:'withdraw'});return res.json({ok:true});
  }
  if(action==='purchase'){
   const products=skuPoints();
   if(typeof body.orderId!=='string'||!/^[\w-]{8,80}$/.test(body.orderId))throw new AppError('주문 정보를 확인해 주세요.');
   const [m]=await database(`hb_members?id=eq.${member}&select=toss_key`);
   const order=await toss('/api-partner/v1/apps-in-toss/order/get-order-status',{orderId:body.orderId},{'x-toss-user-key':m.toss_key});
   if(isSubscriptionSku(order?.sku)){
    if(!['PAYMENT_COMPLETED','PURCHASED','ACTIVE'].includes(order.status))throw new AppError('결제가 완료되지 않았어요.',409);
    await rpc('hb_apply_subscription',{p_member:member,p_order:body.orderId,p_sku:order.sku,p_access:true,p_auto_renew:true,p_expires:parseTossTime(order.expiresAt||order.expires_at)});
    return res.json({ok:true,state:withPhotos(await rpc('hb_snapshot',{p_member:member}))});
   }
   const product=products[order?.sku];
   if(!product)throw new AppError('등록되지 않은 상품이에요. 고객센터에 문의해 주세요.',400);
   if(!['PAYMENT_COMPLETED','PURCHASED'].includes(order.status))throw new AppError('결제가 완료되지 않았어요.',409);
   await rpc('hb_credit_order',{p_member:member,p_order:body.orderId,p_sku:order.sku,p_points:product.points,p_amount:product.won});
   return res.json({ok:true,state:withPhotos(await rpc('hb_snapshot',{p_member:member}))});
  }
  if(!allowedActions.has(action))throw new AppError('지원하지 않는 요청이에요.');
  if(action==='profile'){
   const data=body.data||{};
   if('photo' in data&&(typeof data.photo!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.photo)||data.photo.length>400000))throw new AppError('프로필 사진을 다시 선택해 주세요.');
  }
  const result=await rpc('hb_action',{p_member:member,p_action:action,p_data:body.data||{}});
  if(action==='heartbeat'&&typeof (body.data||{}).mic==='boolean')await rpc('hb_set_mic',{p_member:member,p_mic:!!body.data.mic}).catch(()=>{});
  if(action==='ticket')await dispatchOutbox().catch(()=>{});
  if(action==='signal')return res.json({ok:true});
  const state=await rpc('hb_snapshot',{p_member:member,p_after:Math.max(0,Number(body.after)||0),p_limit:Math.min(100,Math.max(10,Number(body.limit)||10))});
  return res.json({result:withPhotos(result),state:withPhotos(state)});
 }catch(error){console.error(error);return res.status(error.status||500).json({error:error instanceof AppError?error.message:'요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
}
