import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

class LocalDbError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = [
  '20260924_toss_login_disconnect.sql',
  '20260924_service_backend.sql',
  '20260924_welcome_2000.sql',
  '20260924_subscription.sql',
  '20260924_admin_ops.sql',
  '20260924_report_guard.sql',
  '20260926_rejoin_visit.sql',
];
const TABLES = new Set([
  'hb_members', 'hb_sessions', 'hb_tickets', 'hb_outbox', 'hb_visits', 'hb_rooms',
  'hb_ledger', 'hb_notifications', 'hb_waitlist', 'hb_requests', 'hb_focus',
  'toss_login_links', 'hb_orders', 'hb_ad_claims', 'hb_events',
]);
const GUESTS = [
  { key: '91880001', nick: '느긋한 토끼', gender: 'male', drink: 'highball', file: '1.jpg' },
  { key: '91880002', nick: '포근한 구름', gender: 'female', drink: 'wine', file: '2.jpg' },
  { key: '91880003', nick: '조용한 여우', gender: 'male', drink: 'beer', file: '3.jpg' },
  { key: '91880004', nick: '반짝이는 달', gender: 'female', drink: 'cocktail', file: '4.jpg' },
];

let boot;

function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name) || name.length > 40) throw new LocalDbError('잘못된 요청이에요.', 400);
  return name;
}

function sqlFile(name) {
  return readFileSync(join(root, 'supabase/migrations', name), 'utf8');
}

async function seed(db) {
  const seated = await db.query(`select count(*)::int as n from hb_visits where not coalesce(away,false)`);
  if (seated.rows[0].n > 0) return;
  for (const guest of GUESTS) {
    const photoPath = join(root, 'scripts/local-guests', guest.file);
    const photo = existsSync(photoPath)
      ? `data:image/jpeg;base64,${readFileSync(photoPath).toString('base64')}`
      : 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wAAAAD/wAALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB/wA=';
    const login = await db.query('select hb_login($1) as id', [guest.key]);
    const id = login.rows[0].id;
    await db.query('select hb_action($1,$2,$3::jsonb)', [id, 'profile', JSON.stringify({
      nickname: guest.nick, gender: guest.gender, photo, photoChecked: true,
    })]);
    await db.query('select hb_action($1,$2,$3::jsonb)', [id, 'enter', JSON.stringify({
      region: '서울', number: 1, drinkId: guest.drink,
    })]);
  }
  await db.query(`update hb_visits set heartbeat_at=now() where member_id in (select id from hb_members where toss_key like '9188%')`);
  console.log('local db: 서울 1호점에 손님 4명을 넣어 두었어요.');
}

async function start() {
  console.log('local db: PGlite로 켜요. 프로덕션 DB는 쓰지 않아요.');
  const db = new PGlite(join(root, '.local-pg'));
  for (const role of ['anon', 'authenticated', 'service_role']) {
    try { await db.exec(`create role ${role}`); } catch {}
  }
  for (const name of MIGRATIONS) await db.exec(sqlFile(name));
  await seed(db);
  setInterval(() => {
    db.query(`update hb_visits set heartbeat_at=now() where member_id in (select id from hb_members where toss_key like '9188%')`).catch(() => {});
  }, 25000);
  return db;
}

function getDb() {
  boot ||= start();
  return boot;
}

function parseFilters(search) {
  const params = new URLSearchParams(search);
  const filters = [];
  const values = [];
  let select = '*';
  let order = '';
  let limit = '';
  let offset = '';
  let onConflict = '';
  for (const [rawKey, rawValue] of params.entries()) {
    const key = decodeURIComponent(rawKey);
    const value = decodeURIComponent(rawValue);
    if (key === 'select') { select = value.split(',').map(ident).join(', '); continue; }
    if (key === 'limit') { limit = ` limit ${Math.min(200, Math.max(0, Number(value) || 0))}`; continue; }
    if (key === 'offset') { offset = ` offset ${Math.max(0, Number(value) || 0)}`; continue; }
    if (key === 'order') {
      const [col, dir] = value.split('.');
      order = ` order by ${ident(col)} ${dir === 'asc' ? 'asc' : 'desc'}`;
      continue;
    }
    if (key === 'on_conflict') { onConflict = ident(value); continue; }
    const column = ident(key);
    if (value.startsWith('eq.')) { values.push(value.slice(3)); filters.push(`${column} = $${values.length}`); }
    else if (value.startsWith('gt.')) { values.push(value.slice(3)); filters.push(`${column} > $${values.length}`); }
    else if (value.startsWith('lt.')) { values.push(value.slice(3)); filters.push(`${column} < $${values.length}`); }
    else if (value === 'is.null') { filters.push(`${column} is null`); }
    else if (value.startsWith('in.(') && value.endsWith(')')) {
      const items = value.slice(4, -1).split(',').map(item => item.trim()).filter(Boolean);
      items.forEach(item => values.push(item));
      const slots = items.map((_, index) => `$${values.length - items.length + index + 1}`);
      filters.push(`${column} in (${slots.join(',')})`);
    }
  }
  return { filters, values, select, order, limit, offset, onConflict };
}

async function callRpc(db, name, body = {}) {
  const args = body && typeof body === 'object' ? body : {};
  const keys = Object.keys(args);
  const sql = keys.length
    ? `select ${ident(name)}(${keys.map((key, index) => `${ident(key)} => $${index + 1}`).join(', ')}) as r`
    : `select ${ident(name)}() as r`;
  const result = await db.query(sql, keys.map(key => args[key]));
  return result.rows[0]?.r ?? null;
}

export async function rest(path, { method = 'GET', body } = {}) {
  const db = await getDb();
  try {
    const q = path.indexOf('?');
    const table = q < 0 ? path : path.slice(0, q);
    const search = q < 0 ? '' : path.slice(q + 1);
    if (table.startsWith('rpc/')) return callRpc(db, table.slice(4), body);
    if (!TABLES.has(table)) throw new LocalDbError('지원하지 않는 요청이에요.', 400);
    const parsed = parseFilters(search);
    const where = parsed.filters.length ? ` where ${parsed.filters.join(' and ')}` : '';
    if (method === 'GET') {
      const result = await db.query(`select ${parsed.select} from ${table}${where}${parsed.order}${parsed.limit}${parsed.offset}`, parsed.values);
      return result.rows;
    }
    if (method === 'DELETE') {
      await db.query(`delete from ${table}${where}`, parsed.values);
      return [];
    }
    if (method === 'PATCH') {
      const entries = Object.entries(body || {});
      if (!entries.length) return [];
      const sets = entries.map(([key], index) => `${ident(key)} = $${parsed.values.length + index + 1}`);
      const result = await db.query(`update ${table} set ${sets.join(', ')}${where} returning *`, [...parsed.values, ...entries.map(([, value]) => value)]);
      return result.rows;
    }
    if (method === 'POST') {
      const entries = Object.entries(body || {});
      const cols = entries.map(([key]) => ident(key));
      const vals = entries.map(([, value]) => value);
      const slots = cols.map((_, index) => `$${index + 1}`);
      const conflict = parsed.onConflict
        ? ` on conflict (${parsed.onConflict}) do update set ${cols.filter(col => col !== parsed.onConflict).map(col => `${col} = excluded.${col}`).join(', ')}`
        : '';
      const result = await db.query(`insert into ${table} (${cols.join(',')}) values (${slots.join(',')})${conflict} returning *`, vals);
      return result.rows;
    }
    throw new LocalDbError('지원하지 않는 요청이에요.', 405);
  } catch (error) {
    if (error instanceof LocalDbError) throw error;
    const message = String(error?.message || '');
    if (/P0001|raise exception|ERROR:/i.test(message)) {
      const text = message.replace(/^[\s\S]*ERROR:\s*/i, '').split('\n')[0].trim();
      throw new LocalDbError(text || '요청을 저장하지 못했어요.', 400);
    }
    throw new LocalDbError(error.message || '요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.', 503);
  }
}
