import test from 'node:test';
import assert from 'node:assert/strict';
import {socialLogin,resumeSocialLogin,validateCallback} from '../src/social-login.js';

const config = {VITE_SUPABASE_URL:'https://auth.example.test',VITE_SUPABASE_ANON_KEY:'public'};
function platform(onOpen, fetcher) {
  const events = new Map(), removed = [];
  const listen = async (name, callback) => { events.set(name, callback); return {remove:async()=>removed.push(name)}; };
  return {events, removed, app:{addListener:listen}, browser:{addListener:listen,open:async({url})=>onOpen(events,new URL(url)),close:async()=>{}},fetcher};
}
test('closing the login browser cancels immediately and removes both listeners', async()=>{
  const env = platform(events=>events.get('browserFinished')(),()=>{throw Error('must not exchange');});
  await assert.rejects(socialLogin('kakao',config,env),/취소/);
  assert.deepEqual(env.removed,['appUrlOpen','browserFinished']);
});
test('PKCE exchange ignores unrelated callbacks and browser close during exchange',async()=>{
  let calls=0;
  const env=platform((events,url)=>{
    assert.equal(url.searchParams.get('provider'),'kakao');
    assert.equal(url.searchParams.get('code_challenge_method'),'s256');
    events.get('appUrlOpen')({url:'https://evil.test/callback?code=wrong'});
    events.get('appUrlOpen')({url:'com.honsulbar.app://auth/callback?code=verified'});
    events.get('browserFinished')();
  },async(url,options)=>{
    calls++;
    assert.equal(url,'https://auth.example.test/auth/v1/token?grant_type=pkce');
    const body=JSON.parse(options.body);
    assert.equal(body.auth_code,'verified');
    assert.match(body.code_verifier,/^[A-Za-z0-9_-]{43}$/);
    return {ok:true,json:async()=>({access_token:'verified-token',provider_token:'provider-proof'})};
  });
  assert.deepEqual(await socialLogin('kakao',config,env),{accessToken:'verified-token',providerToken:'provider-proof'});
  assert.equal(calls,1);
  assert.equal(env.removed.length,2);
});
test('provider refusal and token exchange failure release login listeners',async()=>{
  for(const query of ['error=access_denied','code=rejected']) {
    const env=platform(events=>events.get('appUrlOpen')({url:`com.honsulbar.app://auth/callback?${query}`}),async()=>({ok:false,json:async()=>({})}));
    await assert.rejects(socialLogin('google',config,env),/로그인/);
    assert.equal(env.removed.length,2);
  }
});

function pendingStore(data) {
  let value=JSON.stringify(data);
  return {getItem:()=>value,setItem:(_,next)=>{value=next;},removeItem:()=>{value=null;}};
}
test('cold-start login exchanges the persisted PKCE verifier once and retains account-linking context',async()=>{
  const now=Date.now();
  const storage=pendingStore({provider:'kakao',verifier:'a'.repeat(43),createdAt:now,purpose:'link',sessionTag:'b'.repeat(64)});
  let calls=0;
  const env={storage,now,app:{getLaunchUrl:async()=>({url:'com.honsulbar.app://auth/callback?code=cold-start-code'})},fetcher:async(_,options)=>{calls++;assert.equal(JSON.parse(options.body).code_verifier,'a'.repeat(43));return {ok:true,json:async()=>({access_token:'verified',provider_token:'provider-proof'})};}};
  const result=await resumeSocialLogin(config,env);
  assert.equal(result.provider,'kakao');assert.equal(result.purpose,'link');assert.equal(result.sessionTag,'b'.repeat(64));
  assert.equal(await resumeSocialLogin(config,env),null);assert.equal(calls,1);
});
test('expired pending login cannot exchange; unrelated or credential-bearing callbacks cannot resume',async()=>{
  const now=Date.now();
  const pending={provider:'google',verifier:'a'.repeat(43),createdAt:now-120001,purpose:'login'};
  const app={getLaunchUrl:async()=>({url:'com.honsulbar.app://auth/callback?code=expired'})};
  assert.equal(await resumeSocialLogin(config,{app,now,storage:pendingStore(pending),fetcher:()=>assert.fail('expired verifier')}),null);
  for(const url of ['com.honsulbar.app://attacker@auth/callback?code=bad','com.honsulbar.app://auth:99/callback?code=bad','com.honsulbar.app://auth/callback#code=bad'])assert.equal(validateCallback(url),false);
  const storage=pendingStore({...pending,createdAt:now});
  assert.equal(await resumeSocialLogin(config,{app:{getLaunchUrl:async()=>({url:'https://evil.test?code=bad'})},now,storage,fetcher:()=>assert.fail('unrelated callback')}),null);
  assert.ok(storage.getItem());
});

test('cold-start transfer preserves the one-time link code and rejects a missing code before exchange',async()=>{
 const now=Date.now(),pending={provider:'google',verifier:'a'.repeat(43),createdAt:now,purpose:'transfer',accountTransferCode:'a'.repeat(22)};
 const app={getLaunchUrl:async()=>({url:'com.honsulbar.app://auth/callback?code=transfer-proof'})};
 const result=await resumeSocialLogin(config,{app,now,storage:pendingStore(pending),fetcher:async()=>({ok:true,json:async()=>({access_token:'verified',provider_token:'provider-proof'})})});assert.equal(result.accountTransferCode,pending.accountTransferCode);assert.equal(result.purpose,'transfer');
 assert.equal(await resumeSocialLogin(config,{app,now,storage:pendingStore({...pending,accountTransferCode:''}),fetcher:()=>assert.fail('missing link code')}),null);
});
test('cold-start code issuance retains the authenticated session binding and rejects an absent binding',async()=>{
 const now=Date.now(),pending={provider:'google',verifier:'a'.repeat(43),createdAt:now,purpose:'transfer-source',sessionTag:'b'.repeat(64)};
 const app={getLaunchUrl:async()=>({url:'com.honsulbar.app://auth/callback?code=source-proof'})};
 const result=await resumeSocialLogin(config,{app,now,storage:pendingStore(pending),fetcher:async()=>({ok:true,json:async()=>({access_token:'verified',provider_token:'provider-proof'})})});
 assert.equal(result.purpose,'transfer-source');assert.equal(result.sessionTag,pending.sessionTag);
 assert.equal(await resumeSocialLogin(config,{app,now,storage:pendingStore({...pending,sessionTag:''}),fetcher:()=>assert.fail('missing source session')}),null);
});

test('cancellation while registering listeners never opens the provider again',async()=>{
 let opened=0;
 const app={addListener:async()=>({remove:async()=>{}})};
 const browser={addListener:async(_,callback)=>{callback();return {remove:async()=>{}};},open:async()=>opened++,close:async()=>{}};
 await assert.rejects(socialLogin('kakao',config,{app,browser}),/취소/);
 assert.equal(opened,0);
});
