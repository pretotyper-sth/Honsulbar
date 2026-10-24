import {timingSafeEqual} from 'node:crypto';
import {hash,rpc,dispatchOutbox} from '../server/platform.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 // The existing GitHub DB-maintenance secret derives a scope-specific token;
 // the powerful database key itself is never sent to this endpoint.
 const accepted=[process.env.CRON_SECRET,process.env.SUPABASE_SERVICE_ROLE_KEY?hash(`honsulbar:maintenance:v1:${process.env.SUPABASE_SERVICE_ROLE_KEY}`):null].filter(Boolean);
 if(!accepted.some(token=>timingSafeEqual(Buffer.from(hash(req.headers.authorization||'')),Buffer.from(hash(`Bearer ${token}`)))))return res.status(401).end();
 try{await rpc('hb_retention',{});await dispatchOutbox();return res.json({ok:true});}catch{return res.status(503).json({error:'maintenance_failed'});}
}
