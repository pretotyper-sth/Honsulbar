import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
}
process.env.VERCEL_ENV ||= 'development';
const routes = {
  service: (await import('../api/service.js')).default,
  maintenance: (await import('../api/maintenance.js')).default,
  'toss-unlink': (await import('../api/toss-unlink.js')).default,
};
const port = Number(process.env.PORT || 3001);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const handler = routes[url.pathname.replace(/^\/api\//, '')];
  if (!handler) { res.writeHead(404).end(); return; }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  req.query = Object.fromEntries(url.searchParams);
  try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res; };
  res.send = value => { res.end(value); return res; };
  await handler(req, res);
}).listen(port, () => console.log(`dev api http://localhost:${port}`));
