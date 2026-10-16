import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {parseFilters,grantLocalTestPoints} from '../server/local-db.js';
import {admin} from '../server/platform.js';
test('local admin queries allow all columns while rejecting injected identifiers',()=>{
 assert.equal(parseFilters('select=*&status=eq.pending&order=created_at.desc').select,'*');
 assert.equal(parseFilters('select=id,nickname').select,'id, nickname');
 assert.throws(()=>parseFilters('select=id%3Bdrop%20table%20hb_members'),/잘못된 요청/);
 assert.deepEqual(parseFilters('id=in.(a,b)').values,['a','b']);
});
test('local test points top up existing and new test accounts once, never production or real accounts',async()=>{
 const previous={...process.env};const db=new PGlite();
 const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
 try{
  await db.exec('create table hb_members(id uuid primary key,toss_key text,balance int);create table hb_ledger(member_id uuid,label text,amount int,reference text unique)');
  for(const [i,id] of ids.entries())await db.query('insert into hb_members values($1,$2,2000)',[id,i===2?'123456':`900${i}`]);
  Object.assign(process.env,{HB_LOCAL_DB:'1',HB_DEV_LOGIN:'1',VERCEL_ENV:'production',NODE_ENV:'development'});
  await grantLocalTestPoints(db,ids[0]);assert.equal((await db.query('select balance from hb_members where id=$1',[ids[0]])).rows[0].balance,2000);
  process.env.VERCEL_ENV='development';process.env.NODE_ENV='production';await grantLocalTestPoints(db,ids[0]);assert.equal((await db.query('select balance from hb_members where id=$1',[ids[0]])).rows[0].balance,2000);
  process.env.NODE_ENV='development';await grantLocalTestPoints(db,ids[0]);await grantLocalTestPoints(db,ids[1]);await grantLocalTestPoints(db,ids[2]);
  assert.deepEqual((await db.query('select balance from hb_members order by id')).rows.map(r=>r.balance),[10000,10000,2000]);
  await db.query('update hb_members set balance=8500 where id=$1',[ids[0]]);await grantLocalTestPoints(db,ids[0]);
  assert.equal((await db.query('select balance from hb_members where id=$1',[ids[0]])).rows[0].balance,8500);
  assert.equal((await db.query('select count(*)::int as n from hb_ledger')).rows[0].n,2);
 }finally{await db.close();for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
test('admin API still rejects unverified and unlisted accounts',async()=>{
 const original=globalThis.fetch,previous=process.env.ADMIN_EMAILS;process.env.ADMIN_EMAILS='operator@example.com';
 try{
  for(const [email,confirmed,allowed] of [['operator@example.com',true,true],['operator@example.com',false,false],['other@example.com',true,false]]){
   globalThis.fetch=async()=>({ok:true,json:async()=>({email,email_confirmed_at:confirmed?'2026-10-16':null})});
   const request=admin({headers:{authorization:'Bearer provider-token'}});
   if(allowed)assert.equal(await request,email);else await assert.rejects(request,/관리자 권한/);
  }
  await assert.rejects(admin({headers:{}}),/관리자 로그인/);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.ADMIN_EMAILS;else process.env.ADMIN_EMAILS=previous;}
});
