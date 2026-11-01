import test from 'node:test';
import assert from 'node:assert/strict';
import {socialLogin} from '../src/social-login.js';

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
    events.get('appUrlOpen')({url:'com.honsulbar.localtest://auth/callback?code=verified'});
    events.get('browserFinished')();
  },async(url,options)=>{
    calls++;
    assert.equal(url,'https://auth.example.test/auth/v1/token?grant_type=pkce');
    const body=JSON.parse(options.body);
    assert.equal(body.auth_code,'verified');
    assert.match(body.code_verifier,/^[A-Za-z0-9_-]{43}$/);
    return {ok:true,json:async()=>({access_token:'verified-token'})};
  });
  assert.equal(await socialLogin('kakao',config,env),'verified-token');
  assert.equal(calls,1);
  assert.equal(env.removed.length,2);
});
test('provider refusal and token exchange failure release login listeners',async()=>{
  for(const query of ['error=access_denied','code=rejected']) {
    const env=platform(events=>events.get('appUrlOpen')({url:`com.honsulbar.localtest://auth/callback?${query}`}),async()=>({ok:false,json:async()=>({})}));
    await assert.rejects(socialLogin('google',config,env),/로그인/);
    assert.equal(env.removed.length,2);
  }
});
