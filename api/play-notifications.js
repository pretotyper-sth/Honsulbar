import {verifyPlayNotification,processPlayNotification} from '../server/play-notifications.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 try{await verifyPlayNotification(req.headers.authorization);await processPlayNotification(req.body);return res.status(204).end();}
 catch(error){return res.status([400,401,403,503].includes(error.status)?error.status:503).json({error:'play_notification_not_processed'});}
}
