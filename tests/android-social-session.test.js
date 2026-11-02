import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/service.js';

async function invoke(body, token) {
  const res={code:200,setHeader(){},status(value){this.code=value;return this;},json(value){this.data=value;return this;}};
  await handler({method:'POST',headers:{origin:'https://localhost',...(token?{authorization:`Bearer ${token}`}:{})},body},res);
  return res;
}

test('verified social identity creates a real SQL member/session, preserves identity on re-login, and revokes logout',async()=>{
  const saved={...process.env},fetcher=globalThis.fetch;
  const path=mkdtempSync(join(tmpdir(),'hb-auth-integration-'));
  try {
    Object.assign(process.env,{NODE_ENV:'development',VERCEL_ENV:'development',HB_LOCAL_DB:'1',HB_DEV_LOGIN:'0',HB_ANDROID_TEST:'0',HB_LOCAL_SEED_GUESTS:'0',HB_LOCAL_SAFETY_CHECKS:'1',HB_LOCAL_DB_PATH:path,HB_ANDROID_AUTH_ENABLED:'1',SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'local-photo-signing-only',HB_IDENTITY_HASH_KEY:'x'.repeat(32)});
    globalThis.fetch=async(url,options)=>{
      assert.match(options.headers.Authorization,/^Bearer /);
      if(url==='https://openidconnect.googleapis.com/v1/userinfo')return {ok:true,json:async()=>({sub:'verified-google-subject'})};
      assert.equal(url,'https://auth.example.test/auth/v1/user');
      return {ok:true,json:async()=>({id:'verified-auth-user',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{sub:'verified-google-subject'}}]})};
    };
    const request={action:'social-login',provider:'google',accessToken:'fixture-token-'.repeat(4),providerToken:'provider-proof'.repeat(3),email:'client-cannot-choose-identity@example.test'};
    const first=await invoke(request);
    assert.equal(first.code,200);assert.ok(first.data.token);
    assert.equal(first.data.state.member.adult,false);
    assert.equal(first.data.state.member.balance,2000);
    assert.equal(first.data.state.guests?.length || 0,0);
    const again=await invoke(request);
    assert.equal(again.data.state.member.id,first.data.state.member.id);
    assert.notEqual(again.data.token,first.data.token);
    assert.equal(again.data.state.member.balance,2000);
    assert.equal((await invoke({action:'state'},first.data.token)).code,200);
    assert.equal((await invoke({action:'android-test-profile'},first.data.token)).code,404);
    assert.equal((await invoke({action:'android-test-purchase',data:{points:1000}},first.data.token)).code,404);
    assert.equal((await invoke({action:'ad-start'},first.data.token)).code,403);
    assert.equal((await invoke({action:'ad-claim',data:{id:'00000000-0000-4000-8000-000000000000'}},first.data.token)).code,403);
    assert.equal((await invoke({action:'logout'},first.data.token)).code,200);
    assert.equal((await invoke({action:'state'},first.data.token)).code,401);
    assert.equal((await invoke({action:'state'},again.data.token)).code,200);
  } finally {
    globalThis.fetch=fetcher;
    for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);
    process.on('exit',()=>rmSync(path,{recursive:true,force:true}));
  }
});
