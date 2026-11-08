import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

test('offline flow transport runs seeded previews, first-guest entry, pause, resume and refund using bundled SQL', async () => {
  const sourceUrl = new URL('../src/flow-mock-api.js', import.meta.url);
  let source = readFileSync(sourceUrl, 'utf8');
  const migrationFiles = Object.fromEntries(readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .filter(name => name.endsWith('.sql'))
    .map(name => ['../supabase/migrations/' + name, readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')]));
  const localSource = readFileSync(new URL('../server/local-db.js', import.meta.url), 'utf8');
  source = source.replace("from '@electric-sql/pglite'", 'from ' + JSON.stringify(new URL('../node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href));
  source = source.replace(/const migrations = .*;\n/, () => 'const migrations = ' + JSON.stringify(migrationFiles) + ';\n');
  source = source.replace(/const localServerSource = .*;\n/, () => 'const localServerSource = ' + JSON.stringify({ source: localSource }) + ';\n');
  source = source.replace("dataDir: 'idb://honsulbar-flow-v2'", "dataDir: 'memory://'");
  const values = new Map();
  const previousStorage = globalThis.localStorage;
  const previousFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  globalThis.fetch = async path => {
    assert.match(path, /^\/flow-mock\/(pglite.wasm|initdb.wasm|pglite.data)$/);
    const file = new URL('../node_modules/@electric-sql/pglite/dist/' + path.split('/').pop(), import.meta.url);
    return new Response(readFileSync(file));
  };
  try {
    source += '\nexport async function closeTestDb(){ if(boot) (await boot).db.close(); }\n';
    const mock = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const request = (action, data) => mock.flowMockRequest({ action, data }, 'POST');
    try {
      assert.equal((await mock.flowMockRequest(null, 'GET')).devLogin, true);
      const login = await mock.flowMockRequest({ action: 'dev-login', key: '98765432' }, 'POST');
      assert.equal(login.state.member.serviceConsentVersion, null);
      await assert.rejects(request('signup-consent',{agreed:false,version:'2026-11-08-full'}),/동의/);
      await assert.rejects(request('signup-consent',{agreed:true,version:'old'}),/최신 동의/);
      const agreed = await request('signup-consent',{agreed:true,version:'2026-11-08-full'});
      assert.equal(agreed.state.member.serviceConsentVersion,'2026-11-08-full');
      assert.equal((await request('state')).state.member.serviceConsentVersion,'2026-11-08-full');
      await request('voice-consent-revoke');
      assert.equal((await request('state')).state.member.serviceConsentVersion,null);
      await request('signup-consent',{agreed:true,version:'2026-11-08-full'});
      assert.equal(login.state.member.adult, true);
      assert.equal(login.state.member.photoChecked, false);
      assert.equal(login.state.rooms.find(room => room.region === '서울' && room.number === 1).count, 2);
      const preview = await request('preview', { region: '서울', number: 1 });
      assert.equal(preview.result.length, 2);
      assert.equal(preview.result[0].photo, '/flow-mock/1.jpg');
      assert.equal(preview.state.member.balance, 9500);
      await request('android-test-profile');
      await request('flow-scenario', { scenario: 'empty' });
      const entered = await request('enter', { region: '경기', firstGuest: true, drinkId: 'highball' });
      assert.equal(entered.state.visit.soloPaused, true);
      assert.equal(entered.state.visit.seconds, 1800);
      assert.equal(entered.state.member.balance, 9000);
      const joined = await request('flow-scenario', { scenario: 'join' });
      assert.equal(joined.state.visit.soloPaused, false);
      assert.equal(joined.state.guests.length, 1);
      await new Promise(resolve => setTimeout(resolve, 40));
      const alone = await request('flow-scenario', { scenario: 'alone' });
      assert.equal(alone.state.visit.soloPaused, true);
      const left = await request('leave');
      assert.equal(left.result.firstGuestCredit, 500);
      assert.equal(left.state.member.balance, 9500);
      assert.equal(left.state.visit, null);
    } finally {
      await mock.closeTestDb();
    }
  } finally {
    globalThis.localStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});

test('production config cannot enable the offline test backend', async () => {
  const { androidBuildConfig } = await import('../scripts/android-build-config.js');
  assert.equal(androidBuildConfig({ HB_ANDROID_FLOW_MOCK: '1' }).define['import.meta.env.VITE_FLOW_MOCK'], 'true');
  const integration = androidBuildConfig({
    HB_ANDROID_MODE: 'integration', HB_ANDROID_FLOW_MOCK: '1',
    HB_ANDROID_API_URL: 'https://api.example.test', HB_AUTH_PUBLIC_URL: 'https://auth.example.test',
    HB_AUTH_PUBLIC_KEY: 'sb_publishable_public',
  });
  assert.equal(integration.define['import.meta.env.VITE_FLOW_MOCK'], 'false');
});
