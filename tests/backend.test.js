import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const sql = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;`);
  await db.exec(sql('20260924_toss_login_disconnect.sql'));
  await db.exec(sql('20260924_service_backend.sql'));
  await db.exec(sql('20260924_admin_ops.sql'));
  const one = async (query, params) => (await db.query(query, params)).rows[0];
  const action = async (member, name, data = {}) => (await one('select hb_action($1,$2,$3::jsonb) as r', [member, name, JSON.stringify(data)])).r;
  const snapshot = async member => (await one('select hb_snapshot($1) as s', [member])).s;
  const login = async key => (await one('select hb_login($1) as id', [key])).id;
  const ready = async (member, nickname) => action(member, 'profile', { nickname, gender: 'male', photo: 'data:image/jpeg;base64,AAAA', photoChecked: true });
  return { db, one, action, snapshot, login, ready };
}

test('signup bonus is granted once per toss account, even after withdrawal', async () => {
  const { db, login, snapshot } = await setup();
  const first = await login('1001');
  assert.equal(await login('1001'), first);
  assert.equal((await snapshot(first)).member.balance, 2000);
  await db.query(`select apply_toss_login_disconnect('1001','withdraw')`);
  const again = await login('1001');
  assert.notEqual(again, first);
  assert.equal((await snapshot(again)).member.balance, 0);
});

test('entering, ordering, moving to the host seat and leaving', async () => {
  const { action, snapshot, login, ready, db } = await setup();
  const me = await login('2001');
  await assert.rejects(action(me, 'enter', { region: '서울', number: 1, drinkId: 'highball' }), /프로필 사진/);
  await ready(me, '느긋한 토끼');
  await action(me, 'enter', { region: '서울', number: 1, drinkId: 'highball' });
  let state = await snapshot(me);
  assert.equal(state.member.balance, 1500);
  assert.equal(state.visit.seat, 0);
  assert.ok(state.visit.seconds > 1790 && state.visit.seconds <= 1800);
  assert.equal(state.rooms.find(r => r.region === '서울' && r.number === 1).count, 1);
  await action(me, 'move', { seat: 11 });
  state = await snapshot(me);
  assert.equal(state.visit.seat, 11);
  const held = state.visit.seconds;
  await db.query(`update hb_visits set heartbeat_at=now() where member_id=$1`, [me]);
  await action(me, 'order', { drinkId: 'wine' });
  state = await snapshot(me);
  assert.equal(state.visit.seconds, held + 1800);
  assert.equal(state.member.balance, 1000);
  await action(me, 'move', { seat: 4 });
  state = await snapshot(me);
  assert.equal(state.visit.seat, 4);
  assert.ok(Math.abs(state.visit.seconds - (held + 1800)) <= 1);
  await action(me, 'leave');
  assert.equal((await snapshot(me)).visit, null);
});

test('seat swap moves points and seats atomically, focus pairs neighbours', async () => {
  const { action, snapshot, login, ready } = await setup();
  const a = await login('3001'), b = await login('3002');
  await ready(a, '말랑한 구름'); await ready(b, '조용한 여우');
  await action(a, 'enter', { region: '부산', number: 1, drinkId: 'beer' });
  await action(b, 'enter', { region: '부산', number: 1, drinkId: 'wine' });
  await action(a, 'move', { seat: 5 });
  let sa = await snapshot(a);
  assert.equal(sa.guests.length, 1);
  assert.equal(typeof sa.guests[0].photo, 'number');
  const { id } = await action(a, 'request', { targetId: b, kind: 'swap' });
  let sb = await snapshot(b);
  assert.equal(sb.requests[0].id, id);
  await action(b, 'respond', { id, accept: true });
  sa = await snapshot(a); sb = await snapshot(b);
  assert.equal(sa.visit.seat, 1); assert.equal(sb.visit.seat, 5);
  assert.equal(sa.member.balance, 1000); assert.equal(sb.member.balance, 2000);
  assert.equal(sb.swapRewardsToday, 1);
  await assert.rejects(action(a, 'request', { targetId: b, kind: 'focus' }), /옆자리/);
  await action(a, 'move', { seat: 4 });
  const focus = await action(a, 'request', { targetId: b, kind: 'focus' }).catch(async () => {
    await new Promise(r => setTimeout(r, 0));
    return null;
  });
  assert.equal(focus, null, 'rate limit blocks a second request inside 10 seconds');
});

test('tickets notify the member when answered and queue an email', async () => {
  const { action, snapshot, login, db, one } = await setup();
  const me = await login('4001');
  const { id } = await action(me, 'ticket', { kind: 'inquiry', category: '이용 방법 문의', message: '입장은 어떻게 하나요?' });
  assert.equal((await one(`select count(*)::int as n from hb_outbox where kind='email'`)).n, 1);
  await db.query(`update hb_tickets set answer='안내해 드릴게요.' where id=$1`, [id]);
  const state = await snapshot(me);
  assert.equal(state.inquiries[0].status, 'answered');
  assert.equal(state.notifications[0].kind, 'inquiry');
  assert.equal(state.notifications[0].data.inquiryId, id);
  assert.equal((await one(`select count(*)::int as n from hb_outbox where kind='push'`)).n, 1);
});

test('reported guests are listed and marked on their current room', async () => {
  const { action, snapshot, login, ready } = await setup();
  const me = await login('8001'), other = await login('8002');
  await ready(me, '차분한 산책러');
  await ready(other, '반짝이는 치즈');
  await action(other, 'enter', { region: '서울', number: 1, drinkId: 'beer' });
  assert.deepEqual((await snapshot(me)).reportedIds, []);
  assert.equal((await snapshot(me)).rooms.find(r => r.region === '서울' && r.number === 1).hasReportedGuest, false);
  await action(me, 'ticket', { kind: 'report', category: '욕설·불쾌한 발언', message: '불편한 말이 오갔어요.', targetId: other });
  const state = await snapshot(me);
  assert.deepEqual(state.reportedIds.map(String), [String(other)]);
  assert.equal(state.rooms.find(r => r.region === '서울' && r.number === 1).hasReportedGuest, true);
});

test('preview, waitlist and daily ad reward', async () => {
  const { action, snapshot, login, ready, db } = await setup();
  const guest = await login('5001'), me = await login('5002');
  await ready(guest, '포근한 오렌지');
  await action(guest, 'enter', { region: '대구', number: 1, drinkId: 'citrus' });
  const preview = await action(me, 'preview', { region: '대구', number: 1 });
  assert.equal(preview.length, 1);
  assert.equal((await snapshot(me)).member.balance, 1500);
  await action(me, 'waitlist', { region: '대구', number: 1 });
  assert.deepEqual((await snapshot(me)).waitlist, ['대구:1']);
  const { id } = await action(me, 'ad-start');
  await assert.rejects(action(me, 'ad-claim', { id }), /광고 시청/);
  await db.query(`update hb_ad_claims set created_at=now()-interval '30 seconds' where id=$1`, [id]);
  await action(me, 'ad-claim', { id });
  const state = await snapshot(me);
  assert.equal(state.member.balance, 2500);
  assert.equal(state.attendanceDate, new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date()));
  await assert.rejects(action(me, 'ad-start'), /이미/);
});

test('subscription covers enter, order and preview without spending points', async () => {
  const { action, snapshot, login, ready, db } = await setup();
  const me = await login('7001');
  await ready(me, '느긋한 달팽이');
  await db.query(`select hb_apply_subscription($1,'sub-order-1','honsulbar_sub_monthly',true,true,now()+interval '30 days')`, [me]);
  let state = await snapshot(me);
  assert.equal(state.member.subscribed, true);
  assert.equal(state.member.subAutoRenew, true);
  assert.equal(state.member.balance, 2000);
  await action(me, 'enter', { region: '서울', number: 1, drinkId: 'highball' });
  state = await snapshot(me);
  assert.equal(state.member.balance, 2000);
  await action(me, 'order', { drinkId: 'wine' });
  assert.equal((await snapshot(me)).member.balance, 2000);
  const guest = await login('7002');
  await ready(guest, '포근한 치즈');
  await action(guest, 'enter', { region: '인천', number: 1, drinkId: 'beer' });
  await action(me, 'leave');
  await action(me, 'preview', { region: '인천', number: 1 });
  assert.equal((await snapshot(me)).member.balance, 2000);
  await db.query(`select hb_apply_subscription($1,'sub-order-1','honsulbar_sub_monthly',true,false,now()+interval '1 day')`, [me]);
  state = await snapshot(me);
  assert.equal(state.member.subscribed, true);
  assert.equal(state.member.subAutoRenew, false);
  await db.query(`select hb_apply_subscription($1,'sub-order-1','honsulbar_sub_monthly',false,false,now()-interval '1 hour')`, [me]);
  assert.equal((await snapshot(me)).member.subscribed, false);
});

test('report stores room context, events stay cheap, and restrict kicks the guest', async () => {
  const { action, snapshot, login, ready, db, one } = await setup();
  const me = await login('8101'), other = await login('8102');
  assert.equal((await one(`select count(*)::int as n from hb_events where name='signup' and member_id=$1`, [me])).n, 1);
  await login('8101');
  assert.equal((await one(`select count(*)::int as n from hb_events where name='login' and member_id=$1`, [me])).n, 1);
  await ready(me, '차분한 바다');
  await ready(other, '반짝이는 숲');
  await action(other, 'enter', { region: '서울', number: 1, drinkId: 'beer' });
  await action(me, 'enter', { region: '서울', number: 1, drinkId: 'wine' });
  const { id } = await action(me, 'ticket', { kind: 'report', category: '조건만남·성매매 시도', message: '외부 연락처를 요구했어요. 010-1234-5678', targetId: other });
  const ticket = await one(`select kind,category,message,context from hb_tickets where id=$1`, [id]);
  assert.equal(ticket.message.includes('010-1234-5678'), true);
  assert.equal(ticket.context.region, '서울');
  assert.equal(ticket.context.number, 1);
  assert.equal(ticket.context.sameRoom, true);
  assert.equal(ticket.context.targetDrink, 'beer');
  assert.ok(ticket.context.reporterSeat != null && ticket.context.targetSeat != null);
  assert.equal((await one(`select count(*)::int as n from hb_events where name='report' and member_id=$1`, [me])).n, 1);
  assert.ok((await one(`select count(*)::int as n from hb_events where name='enter'`)).n >= 2);
  await db.query(`select hb_restrict($1, now()+interval '1 day', true, '반복 위반', true)`, [other]);
  assert.equal((await one(`select count(*)::int as n from hb_visits where member_id=$1`, [other])).n, 0);
  await assert.rejects(action(other, 'enter', { region: '서울', number: 1, drinkId: 'beer' }), /이용이 제한/);
  assert.equal((await snapshot(me)).rooms.find(r => r.region === '서울' && r.number === 1).count, 1);
  const stats = (await one(`select hb_admin_stats() as s`)).s;
  assert.equal(stats.openReports, 1);
  assert.equal(stats.banned, 1);
});

test('heartbeat publishes mic so guests can see a silent seat', async () => {
  const { action, snapshot, login, ready } = await setup();
  const me = await login('8201'), other = await login('8202');
  await ready(me, '느긋한 마이크');
  await ready(other, '조용한 스피커');
  await action(other, 'enter', { region: '서울', number: 1, drinkId: 'beer' });
  await action(me, 'enter', { region: '서울', number: 1, drinkId: 'wine' });
  await action(other, 'heartbeat', { speaker: false, mic: false });
  await action(me, 'heartbeat', { speaker: false, mic: true });
  assert.equal((await snapshot(me)).guests.find(g => String(g.id) === String(other)).mic, false);
  assert.equal((await snapshot(other)).guests.find(g => String(g.id) === String(me)).mic, true);
});

test('credited orders are idempotent', async () => {
  const { login, snapshot, db } = await setup();
  const me = await login('6001');
  for (let i = 0; i < 2; i++) await db.query(`select hb_credit_order($1,'order-1','sku',3300,3000)`, [me]);
  assert.equal((await snapshot(me)).member.balance, 5300);
});

test('decryptField accepts plaintext birthdays and quoted env values', async () => {
  const { createCipheriv, randomBytes } = await import('node:crypto');
  const { decryptField, isAdult } = await import('../server/platform.js');
  process.env.TOSS_DECRYPTION_KEY = `"${Buffer.alloc(32, 7).toString('base64')}"`;
  process.env.TOSS_AAD = '"toss-aad"';
  assert.equal(decryptField('1990-01-01'), '19900101');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), iv);
  cipher.setAAD(Buffer.from('toss-aad', 'utf8'));
  const enc = Buffer.concat([iv, cipher.update('20010315', 'utf8'), cipher.final(), cipher.getAuthTag()]);
  assert.equal(decryptField(enc.toString('base64')), '20010315');
  assert.equal(isAdult('20010315', new Date('2026-09-26T00:00:00+09:00')), true);
});

test('pemFromEnv rebuilds stripped certificates and raw PEM env values', async () => {
  const { pemFromEnv } = await import('../server/platform.js');
  const { createSecureContext } = await import('node:tls');
  const { execFileSync } = await import('node:child_process');
  const pem = execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', '/dev/stdout', '-out', '/dev/stdout', '-days', '1', '-nodes', '-subj', '/CN=pem-test'], { encoding: 'utf8' });
  const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];
  const key = pem.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)[0];
  process.env.TOSS_CLIENT_CERT_BASE64 = Buffer.from(cert.replace(/\n/g, '')).toString('base64');
  process.env.TOSS_CLIENT_KEY_BASE64 = key;
  const restoredCert = pemFromEnv('TOSS_CLIENT_CERT_BASE64');
  const restoredKey = pemFromEnv('TOSS_CLIENT_KEY_BASE64');
  assert.match(restoredCert, /-----END CERTIFICATE-----\n$/);
  createSecureContext({ cert: restoredCert, key: restoredKey });
});
