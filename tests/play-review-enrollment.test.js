import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const aid='00000000-0000-4000-8000-000000000001';
const sql=readFileSync(new URL('../supabase/migrations/20261105_play_review_account.sql',import.meta.url),'utf8');
async function fixture(email='review@example.test'){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create table hb_members(id uuid primary key default gen_random_uuid(),toss_key text unique,nickname text,adult boolean default false,photo_checked boolean default false,balance int default 0,signup_platform text,signup_provider text);
 create table hb_login_identities(provider text constraint hb_login_identities_provider_check check(provider in('toss','google','kakao')),subject_hash text,member_id uuid references hb_members on delete cascade,auth_user_id uuid,primary key(provider,subject_hash));
 create table hb_auth_cleanup(auth_user_id uuid,status text);`);
 await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[aid,email]);return db;
}
test('review enrollment is idempotent and creates no adult/photo/financial grants',async()=>{
 const db=await fixture();try{
 await db.exec(sql);await db.query('select hb_prepare_play_review($1,$2)',[aid,'review@example.test']);const before=(await db.query('select * from hb_members')).rows;
 await db.exec('set role anon');await assert.rejects(db.query('select hb_prepare_play_review($1,$2)',[aid,'review@example.test']),/permission denied/);await db.exec('reset role');
 assert.equal(before.length,1);assert.equal(before[0].adult,false);assert.equal(before[0].photo_checked,false);assert.equal(before[0].balance,0);
 await db.query('select hb_prepare_play_review($1,$2)',[aid,'review@example.test']);assert.deepEqual((await db.query('select * from hb_members')).rows,before);
 const identity=(await db.query('select * from hb_login_identities')).rows[0];assert.equal(identity.auth_user_id,aid);assert.equal(identity.member_id,before[0].id);assert.equal(identity.provider,'play-review');
 }finally{await db.close();}
});
test('incorrect dedicated email and personal identity reuse fail without creating members',async()=>{
 for(const conflict of [false,true]){
 const db=await fixture(conflict?'review@example.test':'other@example.test');try{
 if(conflict)await db.query("insert into hb_login_identities(provider,subject_hash,auth_user_id)values('google','existing',$1)",[aid]);
 await db.exec(sql);await assert.rejects(db.query('select hb_prepare_play_review($1,$2)',[aid,'review@example.test']));assert.equal((await db.query('select count(*)::int n from hb_members')).rows[0].n,0);
 }finally{await db.close();}
 }
});
