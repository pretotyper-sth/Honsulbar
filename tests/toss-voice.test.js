import test from 'node:test';
import assert from 'node:assert/strict';
import { tossVoiceIce, tossVoiceRelayReady } from '../server/toss-voice.js';

test('Toss can use its own Metered TURN servers without borrowing Android credentials', async () => {
  const config = [{urls:['turns:relay.metered.ca:443?transport=tcp'],username:'test',credential:'test'}];
  const env = {HB_ANDROID_ICE_SERVERS: JSON.stringify(config)};
  assert.deepEqual(await tossVoiceIce('member-metered', {env}), {iceServers:[]});
  env.HB_TOSS_ICE_SERVERS = JSON.stringify({iceServers:config});
  assert.equal(tossVoiceRelayReady(env), true);
  assert.deepEqual(await tossVoiceIce('member-metered', {env,now:1000}), {iceServers:config,expiresAt:14_401_000});
  env.HB_TOSS_ICE_SERVERS = JSON.stringify([{urls:'stun:relay.metered.ca:443'}]);
  assert.equal(tossVoiceRelayReady(env), false);
  await assert.rejects(tossVoiceIce('member-metered', {env}), {status:503});
});

test('Toss voice relay issues expiring credentials, filters blocked ports and reuses the same valid lease',async()=>{
  const env={HB_TOSS_TURN_KEY_ID:'test-id',HB_TOSS_TURN_API_TOKEN:'configured-on-server'};
  const relay={urls:['turn:turn.cloudflare.com:53','turns:turn.cloudflare.com:443?transport=tcp'],username:'short-lease',credential:'short-secret'};
  let calls=0;
  const fetcher=async (url,options)=>{
    calls++;
    assert.equal(url,'https://rtc.live.cloudflare.com/v1/turn/keys/test-id/credentials/generate-ice-servers');
    assert.equal(options.headers.Authorization,'Bearer configured-on-server');
    assert.equal(JSON.parse(options.body).ttl,4*60*60);
    return {ok:true,json:async()=>({iceServers:[relay]})};
  };
  const [first,second]=await Promise.all([
    tossVoiceIce('member-a',{env,fetcher,now:1000}),
    tossVoiceIce('member-a',{env,fetcher,now:1001}),
  ]);
  assert.equal(calls,1);
  assert.deepEqual(first,second);
  assert.equal(first.expiresAt,14_401_000);
  assert.deepEqual(first.iceServers[0].urls,['turns:turn.cloudflare.com:443?transport=tcp']);
  assert.deepEqual(await tossVoiceIce('member-a',{env:{},fetcher}),{iceServers:[]});
  await tossVoiceIce('member-a',{env,fetcher,now:first.expiresAt-200_000});
  assert.equal(calls,2);
});

test('provider errors are retryable and do not expose the server token',async()=>{
  const env={HB_TOSS_TURN_KEY_ID:'test-id',HB_TOSS_TURN_API_TOKEN:'secret'};
  let calls=0;
  const fetcher=async()=>{calls++;throw new Error('secret');};
  const request=()=>tossVoiceIce('member-error',{env,fetcher});
  await assert.rejects(request(),{message:'음성 중계에 연결하지 못했어요.',status:503});
  await assert.rejects(request(),{status:503});
  assert.equal(calls,2);
});
