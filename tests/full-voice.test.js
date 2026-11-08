import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {encryptRecording,decryptRecording} from '../server/full-voice.js';

test('compressed audio is encrypted, bounded and format checked',()=>{
 const before={...process.env};
 try{
  process.env.HB_FULL_VOICE_ENABLED='1';process.env.HB_VOICE_EVIDENCE_KEY='ab'.repeat(32);
  const audio=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(28,7)]).toString('base64');
  const row=encryptRecording({mime:'audio/webm;codecs=opus',audio});
  assert.notEqual(row.ciphertext,audio);
  assert.equal(decryptRecording(row),audio);
  assert.throws(()=>encryptRecording({mime:'audio/wav',audio}));
  assert.throws(()=>encryptRecording({mime:'audio/webm;codecs=opus',audio:Buffer.alloc(196609).toString('base64')}));
  process.env.HB_FULL_VOICE_ENABLED='0';assert.throws(()=>encryptRecording({mime:'audio/webm;codecs=opus',audio}));
 }finally{process.env=before;}
});

test('recordings enforce ownership, consent, quotas, idempotency and 24h versus 7d retention',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  const source=readFileSync(new URL('../server/local-db.js',import.meta.url),'utf8');
  const names=source.split('const MIGRATIONS = [')[1].split('];')[0].match(/\d+_[a-z_]+\.sql/g);
  for(const name of names)await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec("create or replace function hb_safety_paused() returns boolean language sql stable as $$select false$$");
  const members=[];
  for(const key of ['98001','98002']){
   const {rows:[row]}=await db.query('select hb_login($1) as id',[key]);members.push(row.id);
   await db.query("update hb_members set adult=true,photo_checked=true,photo='mock',balance=10000 where id=$1",[row.id]);
   await db.query("select hb_accept_service_consent($1,'2026-11-08-full')",[row.id]);
   await db.query("select hb_action($1,'enter',$2::jsonb)",[row.id,JSON.stringify({region:'서울',number:1,drinkId:'wine'})]);
  }
  const {rows:[visit]}=await db.query('select id from hb_visits where member_id=$1',[members[0]]);
  const reserve=async(sequence)=>(await db.query('select hb_recording_allocate($1,$2,$3) as result',[members[0],visit.id,sequence])).rows[0].result;
  const first=await reserve(1);
  assert.equal((await reserve(1)).id,first.id);
  const evidence={ciphertext:'abcd'.repeat(20),iv:'iv',tag:'tag',digest:'digest'};
  await assert.rejects(db.query('select hb_recording_upload($1,$2,$3,$4::jsonb)',[members[1],first.id,'audio/webm;codecs=opus',JSON.stringify(evidence)]),/확인할 수/);
  await db.query('select hb_recording_upload($1,$2,$3,$4::jsonb)',[members[0],first.id,'audio/webm;codecs=opus',JSON.stringify(evidence)]);
  await db.query('select hb_recording_upload($1,$2,$3,$4::jsonb)',[members[0],first.id,'audio/webm;codecs=opus',JSON.stringify(evidence)]);
  const {rows:[chunk]}=await db.query('select bytes,expires_at-created_at as duration from hb_recording_chunks where id=$1',[first.id]);
  assert.equal(chunk.bytes,80);
  const {rows:[hours]}=await db.query("select round(extract(epoch from expires_at-created_at)/3600) as value from hb_recording_chunks where id=$1",[first.id]);
  assert.equal(Number(hours.value),24);
  const report={kind:'report',category:'욕설',message:'모의 신고',targetId:members[1],includeRecording:true};
  await db.query('select hb_recording_report($1,$2::jsonb)',[members[0],JSON.stringify(report)]);
  const {rows:[pinned]}=await db.query('select reported_until from hb_recording_sessions where id=$1',[visit.id]);
  assert.ok(new Date(pinned.reported_until)>new Date(Date.now()+6.99*86400000));
  const second=await reserve(2);
  await db.query("update hb_recording_chunks set created_at=now()-interval '2 minutes' where id=$1",[second.id]);
  await db.query('select hb_recording_cleanup()');
  assert.equal((await db.query('select id from hb_recording_chunks where id=$1',[second.id])).rows.length,0);
  await db.query("update hb_recording_daily set bytes=8388608 where member_id=$1",[members[0]]);
  await assert.rejects(reserve(3),/한도/);
  await db.query("update hb_recording_chunks set expires_at=now()-interval '1 second' where id=$1",[first.id]);
  await db.query('select hb_recording_cleanup()');
  assert.equal((await db.query('select count(*)::integer as n from hb_recording_chunks')).rows[0].n,0);
 }finally{await db.close();}
});
