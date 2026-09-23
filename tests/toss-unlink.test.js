import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/toss-unlink.js';

function response() {
  return { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, end() { return this; }, json(value) { this.body = value; return this; } };
}

const credential = 'test-user:test-password';
const authorization = `Basic ${Buffer.from(credential).toString('base64')}`;

test('rejects callbacks without the configured Basic credential', async () => {
  process.env.TOSS_UNLINK_BASIC_AUTH = credential;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Basic invalid' }, body: { userKey: '123', referrer: 'UNLINK' } }, res);
  assert.equal(res.code, 401);
});

test('records a valid unlink and treats console test user as a no-op', async () => {
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => { calls++; assert.deepEqual(JSON.parse(options.body), { p_user_key: '123', p_action: 'unlink' }); return { ok: true }; };
  try {
    const real = response();
    await handler({ method: 'POST', headers: { authorization }, body: { userKey: 123, referrer: 'UNLINK' } }, real);
    assert.equal(real.code, 204);
    const testResponse = response();
    await handler({ method: 'GET', headers: { authorization }, query: { userKey: '0', referrer: 'UNLINK' } }, testResponse);
    assert.equal(testResponse.code, 204);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('maps withdrawal to account removal and fails closed on database errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => { assert.equal(JSON.parse(options.body).p_action, 'withdraw'); return { ok: false }; };
  try {
    const res = response();
    await handler({ method: 'GET', headers: { authorization }, query: { userKey: '123', referrer: 'WITHDRAWAL_TERMS' } }, res);
    assert.equal(res.code, 503);
  } finally { globalThis.fetch = originalFetch; }
});
