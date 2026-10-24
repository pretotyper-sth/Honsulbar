const url=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,key=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if(!url||!key)throw new Error('The maintenance workflow needs id-token: write permission.');
const tokenUrl=new URL(url);tokenUrl.searchParams.set('audience','honsulbar-maintenance');
const issued=await fetch(tokenUrl,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});
if(!issued.ok)throw new Error(`Workflow authentication failed: HTTP ${issued.status}`);
const {value:token}=await issued.json();
if(!token)throw new Error('Workflow authentication token unavailable.');
const response=await fetch('https://honsulbar-app.vercel.app/api/maintenance',{
 headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000),
});
if(!response.ok)throw new Error(`Safety maintenance failed: HTTP ${response.status}`);
console.log('Safety notification retries and retention completed.');
