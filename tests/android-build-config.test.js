import test from 'node:test';
import assert from 'node:assert/strict';
import { androidBuildConfig } from '../scripts/android-build-config.js';

const settings = {
  HB_ANDROID_MODE: 'integration', HB_ANDROID_API_URL: 'https://api.example.test',
  HB_AUTH_PUBLIC_URL: 'https://auth.example.test', HB_AUTH_PUBLIC_KEY: 'sb_publishable_public',
};
test('integration uses the real HTTPS API and removes local bypasses and simulated purchase mode', () => {
  const config = androidBuildConfig(settings);
  assert.equal(config.define['import.meta.env.VITE_ANDROID_TEST'], 'false');
  assert.equal(config.define['import.meta.env.VITE_API_BASE'], '"https://api.example.test"');
  assert.equal(config.define['import.meta.env.VITE_SOCIAL_LOGIN_ENABLED'], 'true');
  assert.equal(config.envDir, '.android-test-env-unused');
  assert.equal(androidBuildConfig({}).define['import.meta.env.VITE_ANDROID_TEST'], 'true');
});
test('integration refuses missing/insecure endpoints and Auth server secrets', () => {
  for (const value of ['', 'http://api.example.test', 'https://user:password@api.example.test', 'https://api.example.test/path', 'https://api.example.test?key=secret']) {
    assert.throws(() => androidBuildConfig({ ...settings, HB_ANDROID_API_URL: value }));
  }
  for (const value of ['', 'sb_secret_private', `x.${Buffer.from('{"role":"service_role"}').toString('base64url')}.x`]) {
    assert.throws(() => androidBuildConfig({ ...settings, HB_AUTH_PUBLIC_KEY: value }));
  }
  assert.throws(() => androidBuildConfig({ HB_ANDROID_MODE: 'production-typo' }));
});
test('native AdMob configuration rejects a unit ID or malformed app ID before building', () => {
  androidBuildConfig({...settings,HB_ADMOB_APP_ID:'ca-app-pub-7298850744292647~6064200023'});
  for (const value of ['ca-app-pub-7298850744292647/4040671916','unexpected-app-id']) {
    assert.throws(()=>androidBuildConfig({...settings,HB_ADMOB_APP_ID:value}),/HB_ADMOB_APP_ID/);
  }
});
