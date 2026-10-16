import test from 'node:test';
import {randomUUID} from 'node:crypto';
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
  await db.exec(sql('20260926_rejoin_visit.sql'));
  await db.exec(sql('20261012_safety_automation.sql'));
  await db.exec(sql('20261014_report_triage.sql'));
  await db.exec(sql('20261016_face_verification.sql'));
  const one = async (query, params) => (await db.query(query, params)).rows[0];
  const action = async (member, name, data = {}) => (await one('select hb_action($1,$2,$3::jsonb) as r', [member, name, JSON.stringify(data)])).r;
  const snapshot = async member => (await one('select hb_snapshot($1) as s', [member])).s;
  const login = async key => (await one('select hb_login($1) as id', [key])).id;
  const ready = async (member, nickname) => {
    const photo='data:image/jpeg;base64,AAAA';
    const proof=randomUUID();
    await db.query("insert into hb_photo_checks(token_hash,member_id,photo_digest) values(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,encode(sha256(convert_to($3,'UTF8')),'hex'))",[proof,member,photo]);
    return action(member,'profile',{nickname,gender:'male',photo,photoProof:proof,faceConsent:true});
  };
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
  state = await snapshot(me);
  assert.equal(state.visit.away, true);
  assert.equal(state.visit.seat, null);
  assert.ok(state.visit.seconds > 0);
  assert.equal(state.rooms.find(r => r.region === '서울' && r.number === 1).count, 0);
});


test('same branch can be rejoined while leftover time keeps running', async () => {
  const { action, snapshot, login, ready, db } = await setup();
  const me = await login('9001');
  await ready(me, '돌아온 토끼');
  await action(me, 'enter', { region: '서울', number: 1, drinkId: 'highball' });
  const started = (await snapshot(me)).visit.seconds;
  await action(me, 'leave');
  let state = await snapshot(me);
  assert.equal(state.visit.away, true);
  assert.equal(state.member.balance, 1500);
  await db.query(`update hb_visits set expires_at = expires_at - interval '5 minutes' where member_id=$1`, [me]);
  state = await snapshot(me);
  assert.ok(state.visit.seconds <= started - 299);
  await action(me, 'enter', { region: '서울', number: 1 });
  state = await snapshot(me);
  assert.equal(state.visit.away, false);
  assert.ok(state.visit.seat != null);
  assert.equal(state.member.balance, 1500);
  assert.ok(state.visit.seconds <= started - 299);
  await action(me, 'leave');
  await action(me, 'enter', { region: '부산', number: 1, drinkId: 'beer' });
  state = await snapshot(me);
  assert.equal(state.visit.region, '부산');
  assert.equal(state.visit.away, false);
  assert.equal(state.member.balance, 1000);
  assert.ok(state.visit.seconds > 1790 && state.visit.seconds <= 1800);
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
  await ready(me,'안전한 구름');
  await action(me,'enter',{region:'서울',number:1,drinkId:'beer'});
  await action(me, 'ticket', { kind: 'report', category: '욕설·불쾌한 발언', message: '불편한 말이 오갔어요.', targetId: other });
  const state = await snapshot(me);
  assert.deepEqual(state.reportedIds.map(String), [String(other)]);
  assert.equal(state.rooms.find(r => r.region === '서울' && r.number === 1).hasReportedGuest, true);
});

test('preview, waitlist and daily ad reward', async () => {
  const { action, snapshot, login, ready, db } = await setup();
  const guest = await login('5001'), me = await login('5002');
  await ready(guest, '포근한 오렌지');
  await ready(me, '노을빛 구름');
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
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = mkdtempSync(join(tmpdir(),'honsulbar-pem-'));
  let cert,key;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(folder,'key.pem'), '-out', join(folder,'cert.pem'), '-days', '1', '-nodes', '-subj', '/CN=pem-test'], { stdio: 'ignore' });
    cert=readFileSync(join(folder,'cert.pem'),'utf8');key=readFileSync(join(folder,'key.pem'),'utf8');
  } finally { rmSync(folder,{recursive:true,force:true}); }
  process.env.TOSS_CLIENT_CERT_BASE64 = Buffer.from(cert.replace(/\n/g, '')).toString('base64');
  process.env.TOSS_CLIENT_KEY_BASE64 = key;
  const restoredCert = pemFromEnv('TOSS_CLIENT_CERT_BASE64');
  const restoredKey = pemFromEnv('TOSS_CLIENT_KEY_BASE64');
  assert.match(restoredCert, /-----END CERTIFICATE-----\n$/);
  createSecureContext({ cert: restoredCert, key: restoredKey });
});

test('server proof binds account, photo, consent and expiry and is consumed once', async () => {
  const {db,login,action,snapshot}=await setup();
  const me=await login('81001'),other=await login('81002');
  const photo='data:image/jpeg;base64,AAAA';
  const data={nickname:'검증 구름',gender:'male',photo,faceConsent:true};
  const issue=async(proof,expired=false)=>db.query("insert into hb_photo_checks(token_hash,member_id,photo_digest,expires_at) values(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,encode(sha256(convert_to($3,'UTF8')),'hex'),now()+($4||' minutes')::interval)",[proof,me,photo,expired?'-1':'10']);
  await assert.rejects(action(me,'profile',{...data,photoChecked:true}),/먼저 확인/);
  await issue('valid-proof');
  await assert.rejects(action(other,'profile',{...data,photoProof:'valid-proof'}),/먼저 확인/);
  await assert.rejects(action(me,'profile',{...data,photoProof:'valid-proof',photo:'data:image/jpeg;base64,BBBB'}),/먼저 확인/);
  await assert.rejects(action(me,'profile',{...data,photoProof:'valid-proof',faceConsent:false}),/동의/);
  await issue('expired-proof',true);
  await assert.rejects(action(me,'profile',{...data,photoProof:'expired-proof'}),/먼저 확인/);
  await action(me,'profile',{...data,photoProof:'valid-proof'});
  assert.equal((await snapshot(me)).member.photoChecked,true);
  await assert.rejects(action(me,'profile',{...data,photoProof:'valid-proof'}),/먼저 확인/);
  await action(me,'profile',{nickname:'새로운 구름',gender:'male'});
  await db.close();
});

test('a single report protects both directions, cancels connections and refuses entry before spending', async () => {
  const {db,login,ready,action,snapshot,one}=await setup();
  const a=await login('82001'),b=await login('82002');
  await ready(a,'달빛 구름');await ready(b,'조용한 달');
  for(const id of [a,b])await action(id,'enter',{region:'서울',number:1,drinkId:'beer'});
  const request=await action(a,'request',{targetId:b,kind:'focus'});
  await action(b,'respond',{id:request.id,accept:true});
  await action(a,'signal',{targetId:b,signal:{type:'offer',sdp:'test'}});
  await action(a,'ticket',{kind:'report',category:'협박·스토킹',message:'불편한 접근',targetId:b});
  assert.deepEqual((await snapshot(a)).reportedIds,[b]);
  assert.deepEqual((await snapshot(b)).reportedIds,[a]);
  for (const id of [a,b]) {
    const visit=(await snapshot(id)).visit;
    assert.equal(visit.away,false);
    assert.notEqual(visit.seat,null);
  }
  assert.equal((await one('select count(*)::int n from hb_focus')).n,0);
  assert.equal((await one('select count(*)::int n from hb_signals')).n,0);
  await assert.rejects(action(b,'signal',{targetId:a,signal:{type:'offer',sdp:'test'}}),/보호/);
  await assert.rejects(action(b,'request',{targetId:a,kind:'wave'}),/보호/);
  await action(b,'leave');
  const balance=(await snapshot(b)).member.balance;
  await assert.rejects(action(b,'enter',{region:'서울',number:1,ignoreReport:true,drinkId:'wine'}),/보호/);
  await assert.rejects(action(b,'preview',{region:'서울',number:1}),/보호/);
  await assert.rejects(action(b,'waitlist',{region:'서울',number:1}),/보호/);
  assert.equal((await snapshot(b)).member.balance,balance);
  await action(a,'leave');
  await assert.rejects(action(b,'enter',{region:'서울',number:1}),/보호/);
  await action(b,'enter',{region:'부산',number:1,drinkId:'beer'});
  await action(a,'enter',{region:'대구',number:1,drinkId:'beer'});
  await assert.rejects(action(a,'ticket',{kind:'report',category:'기타',message:'다른 방의 대상',targetId:b}),/같은 바/);
  await db.close();
});

test('independent blocks revoke paid photo access and photo versions invalidate older links', async () => {
  const {db,login,ready,action,snapshot,one}=await setup();
  const a=await login('83001'),b=await login('83002');
  await ready(a,'노을빛 달');await ready(b,'포근한 산책');
  for(const id of [a,b])await db.query('insert into hb_sessions(token_hash,member_id) values($1,$2)',[id,id]);
  await action(b,'enter',{region:'서울',number:1,drinkId:'beer'});
  const photo=(await action(a,'preview',{region:'서울',number:1}))[0];
  const visible=async()=> (await one('select hb_can_view_photo($1,$2,$3) ok',[a,b,photo.photo])).ok;
  assert.equal(await visible(),true);
  await action(a,'enter',{region:'서울',number:1,drinkId:'beer'});
  await action(a,'block',{targetId:b});
  for (const id of [a,b]) {
    const visit=(await snapshot(id)).visit;
    assert.equal(visit.away,false);
    assert.notEqual(visit.seat,null);
  }
  assert.equal(await visible(),false);
  assert.deepEqual((await snapshot(b)).reportedIds,[a]);
  assert.equal((await one("select count(*)::int n from hb_tickets where kind='report'")).n,0);
  const previous=(await snapshot(a)).member.photo;
  await db.query("update hb_members set photo='data:image/jpeg;base64,BBBB' where id=$1",[a]);
  assert.notEqual((await snapshot(a)).member.photo,previous);
  assert.equal((await one('select hb_can_view_photo($1,$1,$2) ok',[a,previous])).ok,false);
  await db.close();
});

test('capture challenges expire, belong to their member and cannot be reused', async () => {
  const {db,login,one}=await setup();
  const a=await login('84001'),b=await login('84002');
  const challenge=(await one('select hb_new_photo_challenge($1) c',[a])).c;
  await assert.rejects(one('select hb_use_photo_challenge($1,$2)',[b,challenge.id]),/다시 시작/);
  assert.equal((await one('select hb_use_photo_challenge($1,$2) motion',[a,challenge.id])).motion,challenge.motion);
  await assert.rejects(one('select hb_use_photo_challenge($1,$2)',[a,challenge.id]),/다시 시작/);
  const expired=(await one('select hb_new_photo_challenge($1) c',[a])).c;
  await db.query("update hb_photo_challenges set created_at=now()-interval '4 minutes' where id=$1",[expired.id]);
  await assert.rejects(one('select hb_use_photo_challenge($1,$2)',[a,expired.id]),/다시 시작/);
  await db.close();
});

test('unhandled reports and operator absence pause paid entry without charging', async () => {
  const {db,login,ready,action,snapshot}=await setup();
  const a=await login('85001');await ready(a,'안전한 달빛');
  await action(a,'ticket',{kind:'report',category:'서비스 신고',message:'문제 확인 요청'});
  await db.query("update hb_tickets set created_at=now()-interval '19 hours'");
  assert.equal((await snapshot(a)).safetyPaused,true);
  await assert.rejects(action(a,'enter',{region:'서울',number:1,drinkId:'beer'}),/안전 점검/);
  assert.equal((await snapshot(a)).member.balance,2000);
  await db.query("update hb_tickets set status='closed'");
  await db.query("update hb_safety_ops set reviewed_at=now()-interval '25 hours'");
  assert.equal((await snapshot(a)).safetyPaused,true);
  await db.query("select hb_ops_ping('pretotyper.sth@gmail.com')");
  assert.equal((await snapshot(a)).safetyPaused,false);
  await db.close();
});

test('safety pause preserves unused paid time and releases the room until review resumes', async () => {
  const {db,login,ready,action,snapshot,one}=await setup();
  const a=await login('85501');await ready(a,'남은 시간');
  await action(a,'enter',{region:'서울',number:1,drinkId:'beer'});
  await db.query("update hb_safety_ops set reviewed_at=now()-interval '24 hours 1 second'");
  let state=await snapshot(a);
  assert.equal(state.safetyPaused,true);assert.equal(state.visit.away,true);
  const held=state.visit.seconds;assert.ok(held>=1799 && held<=1802);
  await db.query("update hb_visits set heartbeat_at=now()-interval '2 hours' where member_id=$1",[a]);
  await db.query('select hb_cleanup()');
  assert.equal((await snapshot(a)).visit.seconds,held);
  await assert.rejects(action(a,'move',{seat:2}),/안전 점검/);
  await db.query("select hb_ops_ping('pretotyper.sth@gmail.com')");
  state=await snapshot(a);assert.equal(state.safetyPaused,false);assert.equal(state.visit.away,true);
  assert.ok(Math.abs(state.visit.seconds-held)<=1);
  assert.equal((await one('select safety_remaining from hb_visits where member_id=$1',[a])).safety_remaining,null);
  await action(a,'enter',{region:'서울',number:1,drinkId:'beer'});
  assert.equal((await snapshot(a)).member.balance,1500);
  await db.close();
});

test('restriction identifiers survive account deletion and are erased after their retention period', async () => {
  const {db,login,one}=await setup();
  const me=await login('86001');
  await db.query('update hb_members set identity_key=$1 where id=$2',['f'.repeat(64),me]);
  await db.query("select hb_restrict($1,'9999-12-31',true,'반복 위반',true)",[me]);
  await db.query("select apply_toss_login_disconnect('86001','withdraw')");
  assert.equal((await one('select count(*)::int n from hb_restrictions')).n,1);
  await db.query("update hb_restrictions set delete_after=now()-interval '1 day'");
  await db.query('select hb_retention()');
  assert.equal((await one('select count(*)::int n from hb_restrictions')).n,0);
  await db.close();
});

test('reports preserve visits, group duplicate submissions and triage claims without punishing the target', async()=>{
 const {db,login,ready,action,snapshot,one}=await setup();
 const a=await login('89101'),b=await login('89102');await ready(a,'느긋한 달');await ready(b,'포근한 산');
 for(const id of [a,b])await action(id,'enter',{region:'서울',number:1,drinkId:'beer'});
 const data={kind:'report',category:'기타',message:'돈을 보내지 않으면 죽이겠다고 협박함',targetId:b};
 const first=await action(a,'ticket',data),second=await action(a,'ticket',data);
 assert.equal(first.id,second.id);assert.equal(second.duplicate,true);
 assert.equal((await one("select count(*)::int n from hb_tickets where kind='report'")).n,1);
 const ticket=await one('select * from hb_tickets where id=$1',[first.id]);assert.equal(ticket.context.priority,'urgent');assert.equal(ticket.context.evidenceStatus,'unverified');assert.equal(ticket.context.audioRecorded,false);
 assert.equal((await one('select banned_until from hb_members where id=$1',[b])).banned_until,null);
 assert.equal((await snapshot(a)).visit.away,false);assert.equal((await snapshot(b)).visit.away,false);
 const jobs=await one("select count(*)::int n from hb_outbox where kind='email'");assert.equal(jobs.n,1);
 const summary=(await one('select hb_report_summary($1::uuid[]) s',[[b]])).s;assert.equal(summary[b].reporters,1);
 await db.close();
});

test('moderator action records a private rationale and notifies the target with an appeal route',async()=>{
 const {db,login,one}=await setup();const member=await login('89201');
 await db.query("select hb_restrict($1,now()+interval '24 hours',true,$2,true)",[member,'verified internal review without disclosing reporter']);
 const notice=await one("select body from hb_notifications where member_id=$1 and kind='moderation'",[member]);assert.match(notice.body,/이의 제기/);assert.match(notice.body,/까지/);assert.ok(!notice.body.includes('internal review'));
 await db.close();
});

test('restricted members can read their action notice and appeal without regaining voice access',async()=>{
 const {db,login,ready,action,snapshot,one}=await setup();const member=await login('89301');await ready(member,'차분한 달');
 await db.query("select hb_restrict($1,now()+interval '24 hours',true,'safety review pending',true)",[member]);
 await action(member,'state');const state=await snapshot(member);assert.ok(state.notifications.some(n=>n.kind==='moderation'));
 await action(member,'ticket',{kind:'inquiry',category:'기타 문의',message:'이용 제한 사유를 재검토해 주세요.'});
 assert.equal((await one("select category from hb_tickets where member_id=$1",[member])).category,'이용 제한 이의 제기');
 await assert.rejects(action(member,'enter',{region:'서울',number:1,drinkId:'beer'}),/제한/);
 await assert.rejects(action(member,'ticket',{kind:'report',targetId:member,category:'기타',message:'test'}),/제한/);
 await db.close();
});
