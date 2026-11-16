import test from 'node:test';
import assert from 'node:assert/strict';
import { androidVoiceServers } from '../server/android-voice.js';

test('Android relay configuration fails closed and omits unrelated secret fields', () => {
  assert.deepEqual(androidVoiceServers({}), []);
  const relay = {urls:['turns:relay.example:443?transport=tcp'],username:'test-user',credential:'test-only',adminKey:'must-not-return'};
  assert.deepEqual(androidVoiceServers({HB_ANDROID_ICE_SERVERS:JSON.stringify([relay])}), [{urls:relay.urls,username:'test-user',credential:'test-only'}]);
  for (const value of ['null','{}','[]','not-json',JSON.stringify([{urls:'https://attacker.example'}]),JSON.stringify([{urls:'turn:relay.example'}])]) {
    assert.throws(() => androidVoiceServers({HB_ANDROID_ICE_SERVERS:value}), error => !error.message.includes(value));
  }
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/service.js';
import { database, rpc, newToken, hash } from '../server/platform.js';
test('relay credentials stay out of public config and are scoped to the signed-in platform', async () => {
  const saved={...process.env}, folder=mkdtempSync(join(tmpdir(),'hb-voice-api-'));
  try {
    Object.assign(process.env,{NODE_ENV:'development',VERCEL_ENV:'development',HB_LOCAL_DB:'1',HB_LOCAL_DB_PATH:folder,HB_LOCAL_SEED_GUESTS:'0',HB_IDENTITY_HASH_KEY:'x'.repeat(32),HB_ANDROID_ICE_SERVERS:JSON.stringify([{urls:'turn:relay.example:80',username:'u',credential:'private-fixture'}])});
    process.env.HB_TOSS_ICE_SERVERS = JSON.stringify([{urls:'turns:toss-relay.example:443',username:'u',credential:'toss-fixture'}]);
    const invoke=async(method,token,action='android-voice-config')=>{const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler({method,headers:token?{authorization:'Bearer '+token}:{},query:{},body:{action}},res);return res;};
    assert.equal((await invoke('POST')).code,401);
    assert.ok(!JSON.stringify((await invoke('GET')).data).includes('private-fixture'));
    assert.ok(!JSON.stringify((await invoke('GET')).data).includes('toss-fixture'));
    assert.equal((await invoke('POST', null, 'voice-ice')).code,401);
    const member=await rpc('hb_login',{p_key:'889911'});
    for(const platform of ['toss','android']){
      const token=newToken();await database('hb_sessions',{method:'POST',body:{token_hash:hash(token),member_id:member,platform}});
      const response=await invoke('POST',token);assert.equal(response.code,platform==='android'?200:403);
      if(platform==='android')assert.equal(response.data.result.iceServers[0].credential,'private-fixture');
      assert.equal((await invoke('POST',token,'voice-ice')).code,403);
      if(platform==='toss'){
        const [room]=await database('hb_rooms?select=id&limit=1');
        await database('hb_visits',{method:'POST',body:{member_id:member,room_id:room.id,seat:0,drink_id:'highball',expires_at:new Date(Date.now()+600_000).toISOString()}});
        const toss=await invoke('POST',token,'voice-ice');
        assert.equal(toss.code,200);
        assert.equal(toss.data.result.iceServers[0].credential,'toss-fixture');
      }
    }
  } finally {for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);process.on('exit',()=>rmSync(folder,{recursive:true,force:true}));}
});
