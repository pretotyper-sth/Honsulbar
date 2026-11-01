import test from 'node:test';
import assert from 'node:assert/strict';
import {adminSessionExpiresAt,ADMIN_SESSION_MS} from '../src/admin-session.js';
import {admin} from '../server/platform.js';
const jwt=claims=>'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
test('admin login lasts 30 minutes from authentication, refresh never extends it',()=>{
 const now=1900000000000,iat=now/1000;
 assert.equal(ADMIN_SESSION_MS,1800000);
 assert.equal(adminSessionExpiresAt(jwt({iat,exp:iat+3600}),now),now+1800000);
 assert.equal(adminSessionExpiresAt(jwt({iat,exp:iat+900}),now),now+900000);
 const renewed=jwt({iat:iat+1200,exp:iat+4800,amr:[{method:'password',timestamp:iat}]});
 assert.equal(adminSessionExpiresAt(renewed,now+1200000),now+1800000);
 assert.ok(adminSessionExpiresAt(renewed,now+1800000)<=now+1800000);
 for(const token of ['invalid',jwt({iat:'bad',exp:iat+3600}),jwt({iat:iat+120,exp:iat+3600})])assert.equal(adminSessionExpiresAt(token,now),0);
});
test('server rejects expired admin tokens before accessing the authentication provider',async()=>{
 const send=global.fetch;let called=false;
 global.fetch=async()=>{called=true;throw Error('should not reach provider');};
 try{
  const iat=Math.floor(Date.now()/1000)-1801;
  await assert.rejects(admin({headers:{authorization:'Bearer '+jwt({iat,exp:iat+3600})}}),e=>e.status===401);
  assert.equal(called,false);
 }finally{global.fetch=send;}
});
