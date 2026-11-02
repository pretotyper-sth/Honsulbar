import test from 'node:test';
import assert from 'node:assert/strict';
import { androidPushMessage, registerAndroidPush, unregisterAndroidPush, sendAndroidPush } from '../server/android-push.js';
import { enableAndroidPush } from '../src/android-push.js';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const member='00000000-0000-4000-8000-000000000001';
const token='fcm_token_for_this_device_'.repeat(4);
const job={id:'notification-1',data:{memberId:member,kind:'available',body:'private report text'}};
test('push registration stores a server-only token hash and deletion is scoped to the current member',async()=>{
  const writes=[];const db=async(path,options)=>writes.push({path,options});
  await registerAndroidPush(member,token,{db,sessionHash:'a'.repeat(64)});
  assert.match(writes[0].options.body.token_hash,/^[a-f0-9]{64}$/);
  await unregisterAndroidPush(member,token,{db});
  assert.ok(writes[1].path.includes(`member_id=eq.${member}`));assert.ok(!writes[1].path.includes(token));
  await assert.rejects(registerAndroidPush(member,'bad',{db}));
});
test('FCM payload uses fixed in-app targets and never includes report contents',()=>{
  const message=androidPushMessage(job,token);
  assert.equal(message.data.kind,'available');
  assert.ok(!JSON.stringify(message).includes('private report'));
  assert.equal(message.android.notification.channel_id,'honsulbar_service');
});
test('expired device tokens are deleted; provider failure remains a failed job',async()=>{
  const deleted=[];
  const db=async(path,options)=>options ? deleted.push(path) : path.startsWith('hb_sessions?') ? [{member_id:member}] : [{token_hash:'a'.repeat(64),session_hash:'b'.repeat(64),token}];
  assert.equal((await sendAndroidPush(job,{db,send:async()=> 'expired',ready:true})).delivered,false);
  assert.equal(deleted.length,1);
  await assert.rejects(sendAndroidPush(job,{db,send:async()=>{throw Error('offline');},ready:true}),/offline/);
  assert.equal((await sendAndroidPush(job,{ready:false,db:()=>assert.fail('no DB while disabled')})).available,false);
});
test('native permission refusal never registers a token or reports success',async()=>{
  const sdk={checkPermissions:async()=>({receive:'prompt'}),requestPermissions:async()=>({receive:'denied'}),register:()=>assert.fail('must not register')};
  assert.equal(await enableAndroidPush(async()=>({result:{enabled:true}}),{sdk,enabled:true}),'rejected');
});
test('native push reports success only after server registration, then removes listeners',async()=>{
  const events=new Map(),removed=[],actions=[];
  const sdk={checkPermissions:async()=>({receive:'granted'}),createChannel:async()=>{},addListener:async(name,fn)=>{events.set(name,fn);return {remove:async()=>removed.push(name)};},register:async()=>events.get('registration')({value:token})};
  const api=async(action,data)=>{actions.push(action);if(action==='android-push-register')assert.equal(data.token,token);return {result:{enabled:true}};};
  assert.equal(await enableAndroidPush(api,{sdk,enabled:true}),'agreed');
  assert.deepEqual(actions,['android-push-config','android-push-register']);assert.equal(removed.length,2);
});
test('push devices are inaccessible to clients and disappear with logout or member withdrawal',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table hb_members(id uuid primary key); create table hb_sessions(token_hash text primary key,member_id uuid references hb_members(id) on delete cascade);');
    await db.exec(readFileSync(new URL('../supabase/migrations/20261102_android_push.sql',import.meta.url),'utf8'));
    await db.query('insert into hb_members values($1)',[member]);
    const register=async()=>{
      await db.query('insert into hb_sessions values($1,$2)',['a'.repeat(64),member]);
      await db.query('insert into hb_push_devices(token_hash,member_id,session_hash,token) values($1,$2,$3,$4)',['b'.repeat(64),member,'a'.repeat(64),token]);
    };
    await register();
    await db.exec('set role anon');await assert.rejects(db.query('select * from hb_push_devices'),/permission denied/);await db.exec('reset role');
    await db.query('delete from hb_sessions where token_hash=$1',['a'.repeat(64)]);
    assert.equal((await db.query('select count(*)::int as n from hb_push_devices')).rows[0].n,0);
    await register();await db.query('delete from hb_members where id=$1',[member]);
    assert.equal((await db.query('select count(*)::int as n from hb_push_devices')).rows[0].n,0);
  } finally {await db.close();}
});
