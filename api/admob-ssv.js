import { verifyAdmobCallback } from '../server/admob-ssv.js';
import { AppError, rpc } from '../server/platform.js';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const query = String(req.url || '').split('?').slice(1).join('?');
    const result = await verifyAdmobCallback(query);
    await rpc('hb_complete_android_ad',{p_claim:result.claim,p_unit:result.unit,p_transaction:result.transaction,p_timestamp:result.timestamp,p_test:false});
    return res.status(200).json({ok:true});
  } catch(error) { return res.status(error instanceof AppError ? error.status : 503).json({error:'reward_not_verified'}); }
}
