import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import handler from '../api/service.js';import {database,rpc,newToken,hash} from '../server/platform.js';
async function invoke(body,token){const res={code:200,setHeader(){},status(value){this.code=value;return this;},json(value){this.data=value;return this;}};await handler({method:'POST',headers:{...(token?{authorization:`Bearer ${token}`}:{})},body},res);return res;}
test('API requires both sessions, preserves the Toss account and never creates a member after a bad linking code',async()=>{
 const saved={...process.env},originalFetch=globalThis.fetch,folder=mkdtempSync(join(tmpdir(),'hb-transfer-api-'));
 try{
  Object.assign(process.env,{NODE_ENV:'development',VERCEL_ENV:'development',HB_LOCAL_DB:'1',HB_DEV_LOGIN:'0',HB_ANDROID_TEST:'0',HB_LOCAL_SEED_GUESTS:'0',HB_LOCAL_SAFETY_CHECKS:'1',HB_LOCAL_DB_PATH:folder,HB_ANDROID_AUTH_ENABLED:'1',HB_ACCOUNT_TRANSFER_ENABLED:'1',SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'local-fixture-only',HB_IDENTITY_HASH_KEY:'x'.repeat(32)});
  globalThis.fetch=async url=>{if(url==='https://openidconnect.googleapis.com/v1/userinfo')return {ok:true,json:async()=>({sub:'google-transfer-subject'})};assert.equal(url,'https://auth.example.test/auth/v1/user');return {ok:true,json:async()=>({id:'00000000-0000-4000-8000-000000000001',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{sub:'google-transfer-subject'}}]})};};
  const member=await rpc('hb_login',{p_key:'445566'}),token=newToken();
  await database('hb_sessions',{method:'POST',body:{token_hash:hash(token),member_id:member,platform:'toss'}});
  assert.equal((await invoke({action:'account-transfer-create'})).code,401);
  const issued=await invoke({action:'account-transfer-create',data:{memberId:'attacker-chosen-id'}},token);
  assert.equal(issued.code,200);assert.match(issued.data.result.code,/^[A-Za-z0-9_-]{22}$/);
  const proof={action:'social-login',provider:'google',accessToken:'fixture-supabase-token'.repeat(3),providerToken:'fixture-provider-token'.repeat(3)};
  const bad=await invoke({...proof,accountTransferCode:'z'.repeat(22)});assert.equal(bad.code,400);
  assert.equal((await database('hb_members')).length,1);
  const linked=await invoke({...proof,accountTransferCode:issued.data.result.code});
  assert.equal(linked.code,200);assert.equal(linked.data.state.member.id,member);assert.equal(linked.data.state.member.balance,2000);assert.equal(linked.data.state.member.adult,true);
  assert.equal((await invoke({action:'account-transfer-create'},linked.data.token)).code,400);
  assert.equal((await invoke({...proof,accountTransferCode:issued.data.result.code})).code,400);
  assert.equal((await database('hb_members')).length,1);
  const repeated=await invoke(proof);assert.equal(repeated.data.state.member.id,member);
  const reverse=await invoke({...proof,action:'account-transfer-create'},repeated.data.token);
  assert.equal(reverse.code,200);assert.match(reverse.data.result.code,/^[A-Za-z0-9_-]{22}$/);
  assert.equal((await invoke({...proof,action:'account-transfer-create',providerToken:''},repeated.data.token)).code,400);
  assert.equal((await database('hb_members')).length,1);
  process.env.HB_ACCOUNT_TRANSFER_ENABLED='0';assert.equal((await invoke({...proof,accountTransferCode:'z'.repeat(22)})).code,503);
 }finally{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);process.on('exit',()=>rmSync(folder,{recursive:true,force:true}));}
});
