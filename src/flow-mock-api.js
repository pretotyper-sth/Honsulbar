import { PGlite } from '@electric-sql/pglite';

const migrations = import.meta.glob('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });
const localServerSource = import.meta.glob('../server/local-db.js', { query: '?raw', import: 'default', eager: true });
const migrationNames = Object.values(localServerSource)[0].split('const MIGRATIONS = [')[1].split('];')[0].match(/\d+_[a-z_]+\.sql/g);
const mockGuests = [
  { key: '91880001', nickname: '느긋한 토끼', gender: 'male', photo: '/flow-mock/1.jpg' },
  { key: '91880002', nickname: '포근한 구름', gender: 'female', photo: '/flow-mock/2.jpg' },
  { key: '91880003', nickname: '조용한 여우', gender: 'male', photo: '/flow-mock/3.jpg' },
  { key: '91880004', nickname: '반짝이는 달', gender: 'female', photo: '/flow-mock/4.jpg' },
];
let boot;
let queue = Promise.resolve();

async function createDatabase() {
  const [wasm, initdb, fsBundle] = await Promise.all([
    fetch('/flow-mock/pglite.wasm').then(response => response.arrayBuffer()).then(WebAssembly.compile),
    fetch('/flow-mock/initdb.wasm').then(response => response.arrayBuffer()).then(WebAssembly.compile),
    fetch('/flow-mock/pglite.data').then(response => response.blob()),
  ]);
  const db = await PGlite.create({
    dataDir: 'idb://honsulbar-flow-v2',
    pgliteWasmModule: wasm,
    initdbWasmModule: initdb,
    fsBundle,
  });
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('do $$ begin create role ' + role + '; exception when duplicate_object then null; end $$;');
  }
  await db.exec('create table if not exists hb_flow_migrations(name text primary key)');
  for (const name of migrationNames) {
    const applied = await db.query('select name from hb_flow_migrations where name=$1', [name]);
    if (applied.rows.length) continue;
    await db.exec(migrations['../supabase/migrations/' + name]);
    await db.query('insert into hb_flow_migrations values($1)', [name]);
  }
  await db.exec("create or replace function hb_safety_paused() returns boolean language sql stable as $$ select false $$;");
  await db.query('select hb_sync_safety_time()');
  const guests = [];
  for (const guest of mockGuests) {
    const { rows: [row] } = await db.query('select hb_login($1) as id', [guest.key]);
    await db.query('update hb_members set adult=true,photo_checked=true,photo=$2,nickname=$3,gender=$4,balance=10000 where id=$1',
      [row.id, guest.photo, guest.nickname, guest.gender]);
    guests.push({ ...guest, id: row.id });
  }
  const anyVisits = await db.query('select member_id from hb_visits limit 1');
  if (!anyVisits.rows.length) {
    await db.exec("insert into hb_rooms(region,number) values('서울',2) on conflict do nothing");
    for (const [index, guest] of guests.entries()) await db.query("select hb_action($1,'enter',$2::jsonb)", [guest.id, JSON.stringify({ region: index === 3 ? '경기' : '서울', number: index === 2 ? 2 : 1, drinkId: 'highball' })]);
  }
  return { db, guests };
}

async function dispatch(body, method) {
  boot ||= createDatabase();
  const { db, guests } = await boot;
  const sql = async (query, args = []) => (await db.query(query, args)).rows;
  const rpc = async (member, action, data = {}) => (await sql('select hb_action($1,$2,$3::jsonb) as result', [member, action, JSON.stringify(data)]))[0].result;
  const config = { devLogin: true, apiReady: true, loginReady: true, voiceEvidenceReady: false, playReviewReady: false, accountTransferReady: false, iceServers: [] };
  if (method === 'GET') return config;
  if (body.action === 'dev-login') {
    const [{ id }] = await sql('select hb_login($1) as id', [body.key]);
    await sql('update hb_members set adult=true where id=$1', [id]);
    await sql('create table if not exists hb_flow_grants(member_id uuid primary key)');
    const granted = await sql('insert into hb_flow_grants values($1) on conflict do nothing returning member_id', [id]);
    if (granted.length) await sql('update hb_members set balance=10000 where id=$1', [id]);
    localStorage.setItem('honsulbar:flow-member', id);
    return { token: 'flow-local', state: await snapshot(id) };
  }
  const member = localStorage.getItem('honsulbar:flow-member');
  if (!member) throw new Error('다시 시작하기를 눌러 주세요.');
  // Simulated guests stay connected. Entry, timers and credits use the same SQL as the service.
  await sql("update hb_visits set heartbeat_at=now() where member_id in(select id from hb_members where toss_key like '9188%')");
  let result = {};
  const { action, data = {} } = body;
  if (action === 'signup-consent') {
    if (data.agreed!==true) throw new Error('동의를 확인해 주세요.');
    await sql('select hb_accept_service_consent($1,$2)', [member,data.version]);
    result={version:data.version};
  } else if (action === 'flow-scenario') {
    if (data.scenario === 'empty') await sql('delete from hb_visits where member_id<>$1', [member]);
    else if (data.scenario === 'alone') {
      await sql('delete from hb_visits where room_id=(select room_id from hb_visits where member_id=$1) and member_id<>$1', [member]);
    } else if (data.scenario === 'join') {
      const [room] = await sql('select r.region,r.number from hb_visits v join hb_rooms r on r.id=v.room_id where v.member_id=$1 and not v.away', [member]);
      if (!room) throw new Error('먼저 혼술바에 입장해 주세요.');
      const guest = guests[0];
      await sql('delete from hb_visits where member_id=$1', [guest.id]);
      await rpc(guest.id, 'enter', { ...room, drinkId: 'wine' });
    } else if (data.scenario === 'profile') await profile();
    else if (data.scenario === 'points') await sql('update hb_members set balance=balance+10000 where id=$1', [member]);
  } else if (action === 'voice-consent-revoke') {
    await sql('select hb_revoke_voice_consent($1)', [member]);
  } else if (action === 'flow-subscription') {
    await sql("update hb_members set sub_access=true,sub_auto_renew=true,sub_expires_at=now()+interval '30 days' where id=$1", [member]);
  } else if (action === 'android-test-profile') await profile();
  else if (action === 'android-test-purchase') {
    if (![1000, 3300, 6000, 10000, 20000].includes(data.points)) throw new Error('상품을 다시 선택해 주세요.');
    await sql('update hb_members set balance=balance+$2 where id=$1', [member, data.points]);
    await sql("insert into hb_ledger(member_id,label,amount) values($1,'모의 포인트 충전',$2)", [member, data.points]);
  } else if (action === 'logout' || action === 'delete') {
    await rpc(member, 'leave');
    if (action === 'delete') await sql('delete from hb_members where id=$1', [member]);
    localStorage.removeItem('honsulbar:flow-member');
    return { result: {} };
  } else if (action === 'photo-challenge' || action === 'photo-verify') {
    throw new Error('모의 테스트에서는 프로필 화면의 로컬 테스트 통과를 눌러 주세요.');
  } else if (action === 'waitlist-off') await sql('delete from hb_waitlist where member_id=$1', [member]);
  else if (action === 'signal') return { result: {} };
  else {
    result = await rpc(member, action, data);
    if (action === 'request' && ['focus', 'swap'].includes(data.kind) && guests.some(guest => guest.id === data.targetId)) {
      await rpc(data.targetId, 'respond', { id: result.id, accept: true });
    }
    if (action === 'preview') {
      for (const guest of result) guest.photo = (await sql('select photo from hb_members where id=$1', [guest.id]))[0]?.photo;
    }
  }
  return { result, state: await snapshot(member) };

  async function profile() {
    await sql("update hb_members set adult=true,photo_checked=true,photo=$2,nickname='테스트 손님',gender='male' where id=$1", [member, guests[0].photo]);
  }
  async function snapshot(id) {
    const [{ state }] = await sql('select hb_snapshot($1) as state', [id]);
    const photos = new Map((await sql('select id,photo from hb_members')).map(row => [row.id, row.photo]));
    state.member.photo = photos.get(id);
    state.guests.forEach(guest => { guest.photo = photos.get(guest.id); });
    return state;
  }
}

export function flowMockRequest(body, method) {
  const work = queue.then(() => dispatch(body, method));
  queue = work.catch(() => {});
  return work;
}
