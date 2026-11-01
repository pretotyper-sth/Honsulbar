import {createPublicKey,verify} from 'node:crypto';

const issuer='https://token.actions.githubusercontent.com';
const repository='pretotyper-sth/Honsulbar';
const workflow=`${repository}/.github/workflows/safety-maintenance.yml@refs/heads/main`;
let cachedKeys=[],fetchedAt=0;

export async function githubMaintenanceToken(token,send=fetch,now=Math.floor(Date.now()/1000)) {
 try {
  if(typeof token!=='string'||token.length>12000||!/^[-\w]+\.[-\w]+\.[-\w]+$/.test(token))return false;
  const [head,payload,signature]=token.split('.');
  const header=JSON.parse(Buffer.from(head,'base64url')),claim=JSON.parse(Buffer.from(payload,'base64url'));
  if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200)return false;
  if(claim.iss!==issuer||claim.aud!=='honsulbar-maintenance'||claim.repository!==repository||String(claim.repository_id)!=='1379525736'||String(claim.repository_owner_id)!=='248673999'||claim.ref!=='refs/heads/main'||claim.workflow_ref!==workflow||!['schedule','workflow_dispatch'].includes(claim.event_name))return false;
  const subjects=[`repo:${repository}:ref:refs/heads/main`,'repo:pretotyper-sth@248673999/Honsulbar@1379525736:ref:refs/heads/main'];
  if(!subjects.includes(claim.sub)||![claim.exp,claim.nbf,claim.iat].every(Number.isInteger)||claim.exp<=now||claim.nbf>now+5||claim.iat>now+5||claim.iat<now-600||claim.exp-claim.iat>600)return false;
  if(now-fetchedAt>600||!cachedKeys.length){
   const response=await send(`${issuer}/.well-known/jwks`,{signal:AbortSignal.timeout(5000)});
   if(!response.ok)return false;
   const jwks=await response.json();if(!Array.isArray(jwks.keys))return false;
   cachedKeys=jwks.keys;fetchedAt=now;
  }
  const key=cachedKeys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&key.alg==='RS256'&&key.use==='sig');
  if(!key)return false;
  return verify('RSA-SHA256',Buffer.from(`${head}.${payload}`),createPublicKey({key,format:'jwk'}),Buffer.from(signature,'base64url'));
 }catch{return false;}
}
