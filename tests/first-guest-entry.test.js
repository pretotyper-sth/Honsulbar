import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('first-guest entry charges once, pauses alone, resumes together and returns only eligible entry points', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    const localSource = readFileSync(new URL('../server/local-db.js', import.meta.url), 'utf8');
    const migrations = localSource.split('const MIGRATIONS = [')[1].split('];')[0].match(/\d+_[a-z_]+\.sql/g);
    for (const name of migrations) {
      await db.exec(readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'));
    }
    await db.exec("create or replace function hb_safety_paused() returns boolean language sql stable as $$ select false $$");
    const members = [];
    for (const key of ['90001', '90002']) {
      const { rows: [row] } = await db.query('select hb_login($1) as id', [key]);
      members.push(row.id);
      await db.query("update hb_members set adult=true,photo_checked=true,photo='mock',balance=15000 where id=$1", [row.id]);
    }
    const action = async (index, name, data = {}) => {
      const result = await db.query('select hb_action($1,$2,$3::jsonb) as result', [members[index], name, JSON.stringify(data)]);
      return result.rows[0].result;
    };
    const state = async () => (await db.query('select hb_snapshot($1) as state', [members[0]])).rows[0].state;
    const firstEntry = { region: '서울', firstGuest: true, drinkId: 'highball' };
    await action(0, 'enter', firstEntry);
    assert.equal((await state()).member.balance, 14500);
    assert.equal((await state()).visit.soloPaused, true);
    assert.equal((await state()).visit.seconds, 1800);
    await db.query("update hb_visits set solo_since=solo_since-interval '30 seconds', expires_at=expires_at-interval '30 seconds' where member_id=$1", [members[0]]);
    assert.equal((await state()).visit.seconds, 1800);
    await action(1, 'enter', { region: '서울', number: 1, drinkId: 'highball' });
    assert.equal((await state()).visit.soloPaused, false);
    await db.query("update hb_visits set first_guest_shared_since=now()-interval '20 seconds',expires_at=expires_at-interval '20 seconds' where member_id=$1", [members[0]]);
    assert.equal((await state()).visit.seconds, 1780);
    await action(1, 'leave');
    assert.equal((await state()).visit.soloPaused, true);
    assert.equal((await action(0, 'leave')).firstGuestCredit, 500);
    assert.equal((await state()).visit, null);
    assert.equal((await state()).member.balance, 15000);
    assert.equal((await action(0, 'leave')).firstGuestCredit, undefined);

    // Refund quota is enforced on the server even across separate visits.
    for (let attempt = 0; attempt < 3; attempt++) {
      await action(0, 'enter', firstEntry);
      await db.query("update hb_visits set first_guest_entered_at=now()-interval '31 seconds' where member_id=$1", [members[0]]);
      assert.equal((await action(0, 'leave')).firstGuestCredit, attempt < 2 ? 500 : undefined);
    }
    await db.exec("delete from hb_visits; update hb_ledger set created_at=now()-interval '1 day' where label='첫 손님 입장 포인트 반환';");

    await action(0, 'enter', firstEntry);
    await db.query("update hb_visits set first_guest_shared_time=interval '60 seconds' where member_id=$1", [members[0]]);
    assert.equal((await action(0, 'leave')).firstGuestCredit, undefined);
    await db.exec('delete from hb_visits');
    await action(0, 'enter', firstEntry);
    assert.equal((await action(0, 'leave')).firstGuestCredit, undefined);
    await db.exec('delete from hb_visits');
    await action(0, 'enter', firstEntry);
    await action(0, 'order', { drinkId: 'highball' });
    assert.equal((await state()).visit.seconds, 3600);
    assert.equal((await action(0, 'leave')).firstGuestCredit, undefined);

    await db.exec("delete from hb_visits; delete from hb_rooms where region='대구';");
    await action(0, 'enter', { ...firstEntry, region: '대구' });
    assert.equal((await state()).visit.number, 1);
    assert.equal((await state()).visit.soloPaused, true);
    await assert.rejects(action(0, 'enter', { ...firstEntry, region: '대구' }), /이미 입장/);
    assert.equal((await db.query("select count(*)::integer as count from hb_rooms where region='대구'")).rows[0].count, 1);

    await db.exec('delete from hb_visits');
    await action(1, 'enter', { region: '서울', number: 1, drinkId: 'highball' });
    await action(0, 'enter', firstEntry);
    assert.equal((await state()).visit.number, 2);
    assert.equal((await state()).visit.soloPaused, true);

    await db.exec('delete from hb_visits');
    await action(1, 'enter', { region: '서울', number: 1, drinkId: 'highball' });
    await db.query('update hb_members set photo=null,photo_checked=false where id=$1', [members[0]]);
    const balance = (await state()).member.balance;
    const preview = await action(0, 'preview', { region: '서울', number: 1 });
    assert.equal(preview[0].id, members[1]);
    assert.equal((await state()).member.balance, balance - 500);
    await assert.rejects(action(0, 'enter', firstEntry), /프로필 사진 확인/);
    await db.query('update hb_members set adult=false where id=$1', [members[0]]);
    await assert.rejects(action(0, 'preview', { region: '서울', number: 1 }), /다시 로그인/);
    assert.equal((await state()).member.balance, balance - 500);
  } finally {
    await db.close();
  }
});
