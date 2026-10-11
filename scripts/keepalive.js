// Keeps the free Supabase project from going idle.
// Inserts, updates, and caps rows named "keepalive" on hb_events only.
// The admin day line lists other names, so these rows stay off that screen.
import { fileURLToPath } from 'node:url';

export const KEEP = 24;
const NAME = 'keepalive';

export function eventPath(params = []) {
  return `/rest/v1/hb_events?${['name=eq.keepalive', ...params].join('&')}`;
}

export function cutoff(rows, keep = KEEP) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('keep');
  if (!Array.isArray(rows) || rows.length <= keep) return null;
  const stamp = rows[keep - 1]?.created_at;
  if (typeof stamp !== 'string' || !stamp) throw new Error('missing timestamp');
  return stamp;
}

export async function tick(client, keep = KEEP) {
  const at = new Date().toISOString();
  const inserted = await client.insert({ phase: 'insert', at });
  if (!inserted?.created_at) throw new Error('insert failed');
  const updated = await client.update(inserted.created_at, { phase: 'touched', at });
  if (!updated?.created_at) throw new Error('update failed');
  const rows = await client.list();
  const stamp = cutoff(rows, keep);
  const removed = stamp ? await client.removeOlderThan(stamp) : [];
  if (stamp && removed.length < 1) throw new Error('cleanup failed');
  return { kept: stamp ? keep : rows.length, removed: removed.length };
}

function restClient(url, key) {
  const base = url.replace(/\/$/, '');
  async function rest(method, path, body) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) throw new Error(`supabase ${response.status}`);
    return data;
  }
  return {
    insert(data) {
      return rest('POST', '/rest/v1/hb_events', { name: NAME, data }).then(rows => rows?.[0]);
    },
    update(stamp, data) {
      return rest('PATCH', eventPath([`created_at=eq.${encodeURIComponent(stamp)}`]), { data }).then(rows => rows?.[0]);
    },
    list() {
      return rest('GET', eventPath(['select=created_at', 'order=created_at.desc', 'limit=100']));
    },
    removeOlderThan(stamp) {
      return rest('DELETE', eventPath([`created_at=lt.${encodeURIComponent(stamp)}`]));
    },
  };
}

async function main() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('missing supabase credentials');
  const result = await tick(restClient(url, key));
  console.log(JSON.stringify({ ok: true, ...result }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
