import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { findAvailableBars } from '../src/quick-match.js';

test('two simultaneous searchers get one private offer and can enter the same branch', async () => {
 const db = await PGlite.create();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  const localDb = readFileSync(new URL('../server/local-db.js',import.meta.url),'utf8');
  for (const [name] of localDb.split('const MIGRATIONS = [')[1].split('];')[0].matchAll(/\d+_[a-z_]+\.sql/g)) {
   await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  }
  const query = async (sql,params=[]) => (await db.query(sql,params)).rows[0]?.value;
  const member = async key => {
   const id=await query('select hb_login($1) as value',[key]);
   await db.query("update hb_members set adult=true,photo_checked=true,photo='qa',gender='male',balance=10000 where id=$1",[id]);
   await db.query('insert into hb_sessions(token_hash,member_id) values($1,$2)',[key,id]);
   return id;
  };
  const [a,b,c]=await Promise.all(['98710001','98710002','98710003'].map(member));
  const search=(id,command)=>query("select hb_quick_search($1,$2,'서울') as value",[id,command]);
  const enter=(id,body)=>query('select hb_quick_enter($1,$2) as value',[id,JSON.stringify(body)]);
  const photo=(viewer,target)=>query('select hb_can_view_quick_photo($1,$2,(select photo_version from hb_members where id=$2)) as value',[viewer,target]);
  const [aStart,bStart]=await Promise.all([search(a,'start'),search(b,'start')]);
  assert.equal([aStart,bStart].filter(Boolean).length,1);
  const [aOffer,bOffer]=await Promise.all([search(a,'poll'),search(b,'poll')]);
  assert.equal(aOffer.id,bOffer.id);
  assert.equal(aOffer.guest.id,b);
  assert.equal(bOffer.guest.id,a);
  assert.equal(await photo(a,b),true);
  assert.equal(await photo(c,b),false);
  assert.equal(await query('select count(*)::int as value from hb_visits'),0);
  await assert.rejects(enter(c,{region:'서울',number:aOffer.number,drinkId:'highball'}),/입장할 수 없는/);
  await search(b,'cancel');
  assert.equal(await search(a,'poll'),null);
  assert.equal(await photo(a,b),false);
  await search(a,'start');
  const offer=await search(b,'start');
  const data={quickOfferId:offer.id,drinkId:'highball'};
  await enter(a,data);
  await search(a,'cancel');
  assert.equal((await search(b,'poll')).id,offer.id);
  assert.equal(await query("select count(*)::int as value from jsonb_array_elements(hb_quick_visible_rooms(hb_snapshot($1))->'rooms') r where r->>'region'='서울' and r->>'number'=$2",[c,String(offer.number)]),0);
  await enter(b,data);
  assert.equal(await query('select count(distinct room_id)::int as value from hb_visits'),1);
  assert.equal(await query('select count(*)::int as value from hb_visits'),2);
  assert.equal(await photo(a,b),false);
  const snapshot=id=>query('select hb_snapshot($1) as value',[id]);
  const action=(id,name,body={})=>query('select hb_action($1,$2,$3) as value',[id,name,JSON.stringify(body)]);
  const visit=(await snapshot(a)).visit;
  await action(a,'heartbeat',{visitId:visit.id,seat:visit.seat,facing:75});
  assert.equal((await snapshot(b)).guests.find(g=>g.id===a).facing,75);
  await action(a,'move',{seat:3});
  await action(a,'heartbeat',{visitId:visit.id,seat:visit.seat,facing:90});
  assert.equal((await snapshot(b)).guests.find(g=>g.id===a).facing,0);
  await action(a,'heartbeat',{visitId:visit.id,seat:3,facing:-175});
  assert.equal((await snapshot(b)).guests.find(g=>g.id===a).facing,-175);
  const swap=await action(b,'request',{kind:'swap',targetId:a});
  await action(a,'respond',{id:swap.id,accept:false});
  assert.deepEqual((await snapshot(b)).declinedSwapIds,[swap.id]);
  assert.deepEqual((await snapshot(a)).declinedSwapIds,[]);
  await db.query('update hb_visits set first_guest_charge=null where member_id=$1',[a]);
  await action(a,'leave');
  assert.ok(!(await snapshot(b)).guests.some(g=>g.id===a));
  await enter(a,{region:'서울',number:offer.number});
  assert.equal((await snapshot(b)).guests.find(g=>g.id===a).facing,0);
 } finally {
  await db.close();
 }
});

test('open and full branches are listed in branch order with their real counts', () => {
 const rooms = {'서울':[
  {number:5,count:7}, {number:2,count:12}, {number:1,count:3},
  {number:3,count:4,hasReportedGuest:true}, {number:4,count:0},
 ]};
 assert.deepEqual(findAvailableBars(rooms,'서울',0).map(({number,count})=>[number,count]),
  [[1,3],[2,12],[5,7]]);
});
