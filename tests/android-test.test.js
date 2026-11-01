import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidTestEnabled, androidTestProduct } from '../server/android-test.js';
import handler from '../api/service.js';

const invoke = async (body, token) => {
  const headers = {};
  const res = { code: 200, setHeader(k,v) { headers[k]=v; }, status(code) { this.code=code;return this; }, json(data) { this.data=data;return this; } };
  await handler({method:'POST',headers:{origin:'https://localhost',...(token?{authorization:`Bearer ${token}`}:{})},body},res);
  return {...res,headers};
};
test('Android simulated purchases require isolated local test mode and cannot run in production',async()=>{
  const previous={...process.env};
  const path=mkdtempSync(join(tmpdir(),'hb-android-test-'));
  try {
    Object.assign(process.env,{NODE_ENV:'development',VERCEL_ENV:'development',HB_LOCAL_DB:'1',HB_DEV_LOGIN:'1',HB_ANDROID_TEST:'1',HB_LOCAL_DB_PATH:path});
    assert.equal(androidTestEnabled(),true);
    for(const invalid of [0,-1000,'1000',2500,100000000]) assert.equal(androidTestProduct(invalid),null);
    const login=await invoke({action:'dev-login',key:'98765432'});
    assert.equal(login.code,200);
    const bypass=await invoke({action:'android-test-profile'},login.data.token);
    assert.equal(bypass.code,200);assert.equal(bypass.data.state.member.photoChecked,true);assert.ok(bypass.data.state.member.photo);assert.equal(bypass.data.state.member.nickname,'테스트 손님');
    const before=login.data.state.member.balance;
    const bought=await invoke({action:'android-test-purchase',data:{points:1000}},login.data.token);
    assert.equal(bought.code,200);
    assert.equal(bought.data.state.member.balance,before+1000);
    assert.equal(bought.headers['Access-Control-Allow-Origin'],'https://localhost');
    const invalid=await invoke({action:'android-test-purchase',data:{points:2500}},login.data.token);
    assert.equal(invalid.code,404);
    process.env.HB_ANDROID_TEST='0';
    assert.equal((await invoke({action:'android-test-profile'},login.data.token)).code,404);
    assert.equal((await invoke({action:'android-test-purchase',data:{points:1000}},login.data.token)).code,404);
    process.env.HB_ANDROID_TEST='1';process.env.VERCEL_ENV='production';
    assert.equal(androidTestEnabled(),false);assert.equal(androidTestProduct(1000),null);
    process.env.VERCEL_ENV='development';process.env.NODE_ENV='production';
    assert.equal(androidTestEnabled(),false);
  } finally {
    for(const key of Object.keys(process.env)) if(!(key in previous)) delete process.env[key];
    Object.assign(process.env,previous);
    // PGlite owns the open directory until this test worker exits.
    process.on('exit',()=>rmSync(path,{recursive:true,force:true}));
  }
});
