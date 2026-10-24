import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {githubMaintenanceToken} from '../server/maintenance-auth.js';

test('GitHub maintenance authentication checks signature, expiry, immutable repository IDs and the exact workflow',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const key={...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256',use:'sig'};
 const now=1900000000;
 const base={iss:'https://token.actions.githubusercontent.com',aud:'honsulbar-maintenance',repository:'pretotyper-sth/Honsulbar',repository_id:'1379525736',repository_owner_id:'248673999',ref:'refs/heads/main',workflow_ref:'pretotyper-sth/Honsulbar/.github/workflows/safety-maintenance.yml@refs/heads/main',event_name:'workflow_dispatch',sub:'repo:pretotyper-sth@248673999/Honsulbar@1379525736:ref:refs/heads/main',iat:now,nbf:now,exp:now+300};
 const token=(change={})=>{
  const head=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url'),body=Buffer.from(JSON.stringify({...base,...change})).toString('base64url');
  return `${head}.${body}.${sign('RSA-SHA256',Buffer.from(`${head}.${body}`),privateKey).toString('base64url')}`;
 };
 const send=async()=>new Response(JSON.stringify({keys:[key]}),{status:200});
 assert.equal(await githubMaintenanceToken(token(),send,now),true);
 for(const changed of [{aud:'other'},{repository_id:'other'},{repository_owner_id:'other'},{ref:'refs/heads/evil'},{workflow_ref:'pretotyper-sth/Honsulbar/.github/workflows/evil.yml@refs/heads/main'},{event_name:'pull_request'},{sub:'repo:attacker/fork:ref:refs/heads/main'},{exp:now-1},{nbf:now+30},{exp:now+3600}])assert.equal(await githubMaintenanceToken(token(changed),send,now),false);
 const valid=token().split('.');valid[2]=Buffer.alloc(256).toString('base64url');
 assert.equal(await githubMaintenanceToken(valid.join('.'),send,now),false);
 assert.equal(await githubMaintenanceToken('not-a-token',send,now),false);
});
