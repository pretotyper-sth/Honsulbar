import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {verifySocialIdentity} from '../server/social-auth.js';

test('Auth server identity required; supplied email and client subject never identify a member',async()=>{
 const saved={...process.env},original=globalThis.fetch;
 try {
  Object.assign(process.env,{SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'public',HB_IDENTITY_HASH_KEY:'x'.repeat(32)});
  globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('/auth/v1/user')?({id:'auth-user',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{sub:'verified-id',email:'same@example.test'}}]}):({sub:'verified-id'})});
  const proof='provider-proof'.repeat(3);
  const one=await verifySocialIdentity('a'.repeat(40),'google',proof);
  assert.match(one.subjectHash,/^[a-f0-9]{64}$/);
  assert.equal((await verifySocialIdentity('b'.repeat(40),'google',proof)).subjectHash,one.subjectHash);
  await assert.rejects(verifySocialIdentity('a'.repeat(40),'kakao',proof),/로그인 수단/);
  globalThis.fetch=async()=>({ok:false,json:async()=>({})});
  await assert.rejects(verifySocialIdentity('a'.repeat(40),'google',proof),/다시 로그인/);
  await assert.rejects(verifySocialIdentity('short','google'),/로그인 정보/);
 }finally{globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('a fresh provider proof selects the actual identity even when Auth linked equal emails',async()=>{
 const saved={...process.env},original=globalThis.fetch;
 try {
  Object.assign(process.env,{SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'public',HB_IDENTITY_HASH_KEY:'x'.repeat(32)});
  let proven='kakao-id';
  globalThis.fetch=async url=>({ok:true,json:async()=>({id:'same-auth-user',app_metadata:{provider:'google'},identities:[{provider:'google',identity_data:{sub:'google-id'}},{provider:'kakao',identity_data:{sub:'kakao-id'}}]}),text:async()=>JSON.stringify({id:proven,app_id:1632702,expires_in:3600})});
  assert.equal((await verifySocialIdentity('a'.repeat(40),'kakao','p'.repeat(40))).provider,'kakao');
  proven='someone-else';await assert.rejects(verifySocialIdentity('a'.repeat(40),'kakao','p'.repeat(40)),/로그인 수단/);
 } finally {globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('social identity is stable, separates providers, preserves Toss users and does not grant adult verification',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;');
  for(const name of ['20260924_toss_login_disconnect.sql','20260924_service_backend.sql','20260924_admin_ops.sql','20260926_rejoin_visit.sql','20261012_safety_automation.sql','20261016_face_verification.sql','20261101_multi_platform_identity.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const login=async(provider,hash)=>(await db.query('select hb_social_login($1,$2) id',[provider,hash])).rows[0].id;
  const id=await login('google','a'.repeat(64));assert.equal(await login('google','a'.repeat(64)),id);
  const kakao=await login('kakao','a'.repeat(64));assert.notEqual(kakao,id);
  await db.query('select hb_link_social_identity($1,$2,$3)',[id,'kakao','b'.repeat(64)]);
  assert.equal(await login('kakao','b'.repeat(64)),id);
  await assert.rejects(db.query('select hb_link_social_identity($1,$2,$3)',[kakao,'kakao','b'.repeat(64)]),/다른 계정/);
  assert.equal((await db.query('select balance from hb_members where id=$1',[id])).rows[0].balance,2000);
  const m=(await db.query('select * from hb_members where id=$1',[id])).rows[0];
  assert.equal(m.adult,false);assert.equal(m.signup_platform,'android');assert.equal(m.signup_provider,'google');assert.equal(m.last_login_platform,'android');
  assert.equal((await db.query("select hb_login('12345') id")).rows.length,1);
  assert.equal((await db.query("select adult from hb_members where toss_key='12345'")).rows[0].adult,true);
  await db.query('delete from hb_members where id=$1',[id]);assert.equal((await db.query('select * from hb_login_identities where member_id=$1',[id])).rows.length,0);
  const again=await login('google','a'.repeat(64));assert.notEqual(again,id);assert.equal((await db.query('select balance from hb_members where id=$1',[again])).rows[0].balance,0);
 }finally{await db.close();}
});
