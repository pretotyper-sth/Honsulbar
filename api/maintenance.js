import {timingSafeEqual} from 'node:crypto';
import {hash,rpc,dispatchOutbox} from '../server/platform.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!process.env.CRON_SECRET||!timingSafeEqual(Buffer.from(hash(req.headers.authorization||'')),Buffer.from(hash(`Bearer ${process.env.CRON_SECRET}`))))return res.status(401).end();
 try{await rpc('hb_retention',{});await dispatchOutbox();return res.json({ok:true});}catch{return res.status(503).json({error:'maintenance_failed'});}
}
