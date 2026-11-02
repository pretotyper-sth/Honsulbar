import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';

function client(fetcher, socialLogin = async () => ({})) {
  const values = new Map([['honsulbar:session:v1', 'old-session']]);
  const context = {
    location: {hostname:'localhost'}, env:{}, fetch:fetcher, socialLogin,
    crypto:webcrypto, TextEncoder, AbortController, setTimeout, clearTimeout,
    localStorage: {getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    pendingAgeTest() {},
  };
  // Execute the actual client with only browser/import boundaries replaced.
  const source = readFileSync(new URL('../src/api.js',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replaceAll('import.meta.env','env').replaceAll('export ','');
  runInNewContext(source+'\nthis.api={call,logout,linkSocialAccount,login,setToken,hasSession};',context);
  return {api:context.api,values};
}
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const response = (status,data) => ({status,ok:status===200,json:async()=>data});

test('late 401 and successful state responses from the old account cannot affect the new account',async()=>{
  for(const status of [401,200]) {
    const pending=deferred();let authorization;
    const {api,values}=client(async(_,options)=>{authorization=options.headers.Authorization;return pending.promise;});
    const request=api.call('state');
    api.setToken('new-session');pending.resolve(response(status,{state:{member:{id:'old-member'}}}));
    await assert.rejects(request,error=>error.status===409);
    assert.equal(authorization,'Bearer old-session');
    assert.equal(values.get('honsulbar:session:v1'),'new-session');
  }
});

test('late logout cannot clear a new login',async()=>{
  const pending=deferred();const {api,values}=client(()=>pending.promise);
  const logout=api.logout();api.setToken('new-session');pending.resolve(response(200,{}));
  await logout;assert.equal(values.get('honsulbar:session:v1'),'new-session');
});

test('account linking and login reject OAuth proof when the starting session changed',async()=>{
  for(const action of ['linkSocialAccount','login']) {
    const pending=deferred(),started=deferred();let requests=0;
    const {api}=client(()=>{requests++;throw Error('must not submit stale proof');},async()=>{started.resolve();return pending.promise;});
    const operation=action==='login'?api.login({},'google'):api.linkSocialAccount('google');
    await started.promise;api.setToken('new-session');pending.resolve({accessToken:'old-proof',providerToken:'old-provider'});
    await assert.rejects(operation,error=>error.status===409);assert.equal(requests,0);
  }
});
