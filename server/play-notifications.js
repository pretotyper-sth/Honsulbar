import {OAuth2Client} from 'google-auth-library';
import {AppError,database,hash} from './platform.js';
import {processPlaySubscription} from './play-billing.js';
const verifier=new OAuth2Client();
export async function verifyPlayNotification(header,env=process.env,verify=options=>verifier.verifyIdToken(options)){
 if(env.HB_PLAY_NOTIFICATIONS_ENABLED!=='1'||!env.HB_PLAY_NOTIFICATION_EMAIL||!env.HB_PLAY_NOTIFICATION_AUDIENCE?.startsWith('https://'))throw new AppError('not_configured',503);
 if(typeof header!=='string'||!/^Bearer [\w.-]+$/.test(header)||header.length>16384)throw new AppError('unauthorized',401);
 try{
  const ticket=await verify({idToken:header.slice(7),audience:env.HB_PLAY_NOTIFICATION_AUDIENCE});
  const p=ticket.getPayload();
  if(!p||p.email!==env.HB_PLAY_NOTIFICATION_EMAIL||p.email_verified!==true||p.aud!==env.HB_PLAY_NOTIFICATION_AUDIENCE||!['accounts.google.com','https://accounts.google.com'].includes(p.iss))throw Error();
 }catch{throw new AppError('unauthorized',401);}
}
export async function processPlayNotification(body,{env=process.env,db=database,subscription=processPlaySubscription}={}){
 if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw new AppError('invalid_body',400);}}
 const message=body?.message;
 if(typeof message?.messageId!=='string'||typeof message.data!=='string'||message.data.length>65536||!/^[A-Za-z0-9+/]+={0,2}$/.test(message.data))throw new AppError('invalid_message',400);
 let event;try{event=JSON.parse(Buffer.from(message.data,'base64').toString('utf8'));}catch{throw new AppError('invalid_event',400);}
 if(!env.HB_PLAY_PACKAGE_NAME||event.packageName!==env.HB_PLAY_PACKAGE_NAME)throw new AppError('wrong_package',403);
 if(event.testNotification)return {test:true};
 // RTDN is a trigger; only Google's latest purchase response determines entitlement.
 const notification=event.subscriptionNotification||(event.voidedPurchaseNotification?.productType===1?event.voidedPurchaseNotification:null);
 if(!notification)throw new AppError('unsupported_notification',503);
 const token=notification.purchaseToken;
 if(typeof token!=='string'||token.length<16||token.length>8192)throw new AppError('invalid_purchase',400);
 const order=`play-sub:${hash(`${env.HB_PLAY_PACKAGE_NAME}:${token}`)}`;
 const [purchase]=await db(`hb_orders?order_id=eq.${order}&select=member_id,sku`);
 // Retry a notification that raced the initial durable purchase verification.
 if(!purchase?.member_id)throw new AppError('purchase_not_registered',503);
 const result=await subscription(purchase.member_id,{productId:purchase.sku,purchaseToken:token},{env,db});
 return {verified:true,access:result.access};
}
