import {timingSafeEqual} from 'node:crypto';
import {hash,rpc,dispatchOutbox} from '../server/platform.js';
import {githubMaintenanceToken} from '../server/maintenance-auth.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const header=req.headers.authorization||'';
 const cron=!!process.env.CRON_SECRET&&timingSafeEqual(Buffer.from(hash(header)),Buffer.from(hash(`Bearer ${process.env.CRON_SECRET}`)));
 if(!cron&&!await githubMaintenanceToken(header.replace(/^Bearer /,'')))return res.status(401).end();
 let stage='retention';
 try{await rpc('hb_retention',{});stage='notifications';await dispatchOutbox();return res.json({ok:true});}
 catch(error){return res.status(503).json({error:'maintenance_failed',stage,databaseStatus:error.databaseStatus||null,databaseCode:error.databaseCode||null});}
}
