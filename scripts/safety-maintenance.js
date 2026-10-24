import {createHash} from 'node:crypto';

const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!secret)throw new Error('Configure the existing SUPABASE_SERVICE_ROLE_KEY repository secret.');
const token=createHash('sha256').update(`honsulbar:maintenance:v1:${secret}`).digest('hex');
const response=await fetch('https://honsulbar-app.vercel.app/api/maintenance',{
 headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000),
});
if(!response.ok)throw new Error(`Safety maintenance failed: HTTP ${response.status}`);
console.log('Safety notification retries and retention completed.');
