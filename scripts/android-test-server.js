import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('Local tests only');
// Never inherit cloud credentials or load .env.local for this test server.
for (const key of Object.keys(process.env)) {
  if (/^(TOSS_|AIT_|SUPABASE_|VITE_|RESEND_|BREVO_|SUPPORT_|HB_|WEBRTC_|ADMIN_|CRON_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'development', VERCEL_ENV: 'development', HB_LOCAL_DB: '1', HB_DEV_LOGIN: '1', HB_ANDROID_TEST: '1',
  HB_LOCAL_DB_PATH: fileURLToPath(new URL('../.local-pg-android', import.meta.url)),
  SUPABASE_SERVICE_ROLE_KEY: randomBytes(32).toString('hex'),
});
globalThis.fetch = async () => { throw new Error('External requests disabled in Android zero-cost test server'); };
const handler = (await import('../api/service.js')).default;
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost:3001');
  if (url.pathname !== '/api/service') { res.writeHead(404).end(); return; }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1500000) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    req.query = Object.fromEntries(url.searchParams);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
    res.send = data => { res.end(data); return res; };
    await handler(req, res);
  } catch { if (!res.writableEnded) res.writeHead(400).end(); }
}).listen(3001, '127.0.0.1', () => console.log('Android local test API: http://localhost:3001 (cloud requests disabled)'));
