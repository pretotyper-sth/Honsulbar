import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/service.js';
import { BAR_OPERATIONS_DEFAULTS } from '../src/bar-operations.js';
import { shuffleBarMusic } from '../src/bar-music.js';

function call({ method = 'POST', body, token, query }) {
  const result = { statusCode:200 };
  const response = {
    setHeader(){},
    status(code) { result.statusCode=code; return this; },
    json(value) { result.body=value; return this; },
  };
  return handler({method, body, query, headers:token ? {authorization:`Bearer ${token}`} : {}},response).then(() => result);
}

test('bar operations allow only authorized saves, publish settings and prevent overwriting newer revisions', async () => {
  const originalFetch = globalThis.fetch;
  const previous = {...process.env};
  const now = Math.floor(Date.now()/1000);
  const token = 'header.' + Buffer.from(JSON.stringify({iat:now,exp:now+3600})).toString('base64url') + '.signature';
  try {
    Object.assign(process.env,{HB_LOCAL_DB:'1',HB_LOCAL_DB_PATH:'memory://',VERCEL_ENV:'development',NODE_ENV:'test',
      ADMIN_EMAILS:'ops@example.test',SUPABASE_URL:'https://auth.example.test',SUPABASE_SERVICE_ROLE_KEY:'local-test-key'});
    globalThis.fetch = async (url, {headers}) => {
      assert.equal(url,'https://auth.example.test/auth/v1/user');
      assert.equal(headers.Authorization,`Bearer ${token}`);
      return {ok:true,json:async()=>({email:'ops@example.test',email_confirmed_at:'2026-11-17'})};
    };
    const read = () => call({query:{barOperations:'1'},method:'GET'});
    const write = (settings, revision, auth = token) =>
      call({body:{action:'admin-save-bar-operations',settings,revision},token:auth});
    const get = await call({body:{action:'admin-bar-operations'},token});
    assert.deepEqual(get.body,{settings:BAR_OPERATIONS_DEFAULTS,revision:0});
    const settings = {tracks:['bossa-antigua'],bgmVolume:55,
      roomThemes:[{region:'서울',number:1,theme:'holiday'}],lobbyNotice:' 오늘은 크리스마스 바가 열려요. '};
    assert.equal((await write(settings,0,null)).statusCode,401);
    assert.equal((await write({...settings,tracks:['https://other.test/audio']},0)).statusCode,400);
    assert.equal((await write({...settings,tracks:[]},0)).statusCode,400);
    assert.equal((await write({...settings,roomThemes:[settings.roomThemes[0],settings.roomThemes[0]]},0)).statusCode,400);
    const normalized = {...settings,lobbyNotice:settings.lobbyNotice.trim()};
    const saved = await write(settings,0);
    assert.deepEqual(saved.body,{settings:normalized,revision:1});
    assert.equal((await write({...settings,bgmVolume:70},0)).statusCode,409);
    assert.deepEqual((await read()).body,{settings:normalized});
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env,previous);
  }
});

test('a configured playlist plays only its configured tracks, including a one-song loop', () => {
  const track = shuffleBarMusic(undefined,['bossa-antigua'])[0];
  assert.deepEqual(shuffleBarMusic(track,['bossa-antigua']),[track]);
  const queue = shuffleBarMusic(track,['bossa-antigua','lobby-time']);
  assert.deepEqual(queue.map(item=>item.file),['lobby-time','bossa-antigua']);
});
