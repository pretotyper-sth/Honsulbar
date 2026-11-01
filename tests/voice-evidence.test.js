import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createVoiceBuffer,evidencePayload} from '../src/voice-evidence.js';
import {validateVoiceEvidence,encryptEvidence,decryptEvidence} from '../server/voice-evidence.js';
import handler from '../api/service.js';
import {voicePeerIds} from '../src/social.js';

test('private conversations remove unrelated WebRTC peers instead of only lowering their volume',()=>{
 const guests=[{id:'a'},{id:'b'},{id:'c'}];
 assert.deepEqual(voicePeerIds(guests,{me:'b',b:'me'}),['b']);
 assert.deepEqual(voicePeerIds(guests,{a:'b',b:'a'}),['c']);
 assert.deepEqual(voicePeerIds(guests,{},new Set(['a'])),['b','c']);
});

test('voice buffer retains the latest 20 seconds, exports a valid WAV, and clears',()=>{
 const buffer=createVoiceBuffer();
 buffer.append(new Float32Array(16000*25).fill(.25),16000);
 const payload=evidencePayload(buffer),audio=validateVoiceEvidence(payload);
 assert.equal(payload.seconds,20);assert.equal(audio.length,640044);
 buffer.clear();assert.equal(evidencePayload(buffer),null);
 assert.throws(()=>validateVoiceEvidence({...payload,audio:Buffer.from('not audio').toString('base64')}));
 const wrong=Buffer.from(audio);wrong.writeUInt32LE(48000,24);
 assert.throws(()=>validateVoiceEvidence({...payload,audio:wrong.toString('base64')}));
});

test('evidence encryption rejects tampering and never stores plaintext',()=>{
 const oldKey=process.env.HB_VOICE_EVIDENCE_KEY,oldEnabled=process.env.HB_VOICE_EVIDENCE_ENABLED;
 process.env.HB_VOICE_EVIDENCE_KEY='ab'.repeat(32);process.env.HB_VOICE_EVIDENCE_ENABLED='1';
 try {
  const buffer=createVoiceBuffer();buffer.append(new Float32Array(16000).fill(.2),16000);
  const audio=validateVoiceEvidence(evidencePayload(buffer)),encrypted=encryptEvidence(audio);
  assert.deepEqual(decryptEvidence(encrypted),audio);assert.notEqual(encrypted.ciphertext,audio.toString('base64'));
  assert.throws(()=>decryptEvidence({...encrypted,tag:Buffer.alloc(16).toString('base64')}));
 }finally{if(oldKey===undefined)delete process.env.HB_VOICE_EVIDENCE_KEY;else process.env.HB_VOICE_EVIDENCE_KEY=oldKey;if(oldEnabled===undefined)delete process.env.HB_VOICE_EVIDENCE_ENABLED;else process.env.HB_VOICE_EVIDENCE_ENABLED=oldEnabled;}
});

test('live entry rejects missing consent and ordinary users cannot read administrator evidence',async()=>{
 const previous={...process.env},originalFetch=global.fetch;
 Object.assign(process.env,{HB_VOICE_EVIDENCE_ENABLED:'1',HB_VOICE_EVIDENCE_KEY:'cd'.repeat(32),SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-key',VERCEL_ENV:'production'});
 const id='00000000-0000-0000-0000-000000000001';
 global.fetch=async url=>new Response(JSON.stringify(String(url).includes('/auth/v1/user')?{email:'outsider@example.com',email_confirmed_at:'2026-10-24'}:String(url).includes('hb_sessions')?[{member_id:id}]:[]),{status:200});
 const response=()=>({statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
 try {
  const res=response();await handler({method:'POST',headers:{authorization:'Bearer '+'t'.repeat(43)},body:{action:'enter',data:{region:'서울',number:1}}},res);
  assert.equal(res.statusCode,403);assert.match(res.body.error,/동의/);
  const now=Math.floor(Date.now()/1000),ordinary='header.'+Buffer.from(JSON.stringify({iat:now,exp:now+3600})).toString('base64url')+'.signature';
  const admin=response();await handler({method:'POST',headers:{authorization:'Bearer '+ordinary},body:{action:'admin-evidence',id}},admin);
  assert.equal(admin.statusCode,403);
 } finally {
  global.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);
 }
});

test('database requires both consents and a shared room, stores evidence atomically, and expires it',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;');
  for(const name of ['20260924_toss_login_disconnect.sql','20260924_service_backend.sql','20260924_admin_ops.sql','20260926_rejoin_visit.sql','20261012_safety_automation.sql','20261014_report_triage.sql','20261016_face_verification.sql','20261024_voice_evidence.sql','20261025_scoped_safety_cleanup.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
  const a=(await one("select hb_login('50101') id")).id,b=(await one("select hb_login('50102') id")).id;
  await db.query("update hb_members set nickname='검증사용자',gender='male',photo='data:image/jpeg;base64,AAAA',photo_checked=true where id in($1,$2)",[a,b]);
  for(const id of [a,b])await db.query("select hb_action($1,'enter','{\"region\":\"서울\",\"number\":1,\"drinkId\":\"highball\"}')",[id]);
  const data={targetId:b,category:'음성 시험',message:'동의한 두 시험 계정의 신고입니다.'},encrypted={ciphertext:'encrypted-test',iv:'test',tag:'test',digest:'test'};
  const submit=()=>one('select hb_submit_voice_report($1,$2,$3) r',[a,JSON.stringify(data),JSON.stringify(encrypted)]);
  await assert.rejects(submit(),/동의/);
  for(const id of [a,b])await db.query("insert into hb_voice_consents(member_id,version) values($1,'2026-10-24')",[id]);
  const result=(await submit()).r;
  assert.ok(result.id);
  assert.equal((await one('select count(*)::int n from hb_voice_evidence')).n,1);
  assert.equal((await one('select context from hb_tickets where id=$1',[result.id])).context.audioRecorded,true);
  assert.equal((await one('select hb_pair_blocked($1,$2) blocked',[a,b])).blocked,true);
  await db.query("update hb_voice_evidence set expires_at=now()-interval '1 hour'");
  await db.query('select hb_retention()');
  assert.equal((await one('select count(*)::int n from hb_voice_evidence')).n,0);
  await db.query('select hb_revoke_voice_consent($1)',[a]);
  assert.equal((await one('select count(*)::int n from hb_voice_consents where member_id=$1',[a])).n,0);
  assert.equal((await one('select count(*)::int n from hb_visits where member_id=$1 and not coalesce(away,false)',[a])).n,0);
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from hb_voice_evidence'),/permission/);
 }finally{await db.close();}
});
