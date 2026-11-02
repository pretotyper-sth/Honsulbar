import test from 'node:test';import assert from 'node:assert/strict';import {PGlite}from'@electric-sql/pglite';import{readFileSync}from'node:fs';import{cleanupAuthUsers}from'../server/auth-cleanup.js';import{socialAuthMember}from'../server/social-auth.js';
const aid='00000000-0000-4000-8000-000000000001';
test('Auth mapping and cleanup lease preserve shared members and block rejoining while deletion is in flight',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const f of ['20260924_toss_login_disconnect.sql','20260924_service_backend.sql','20260924_admin_ops.sql','20260926_rejoin_visit.sql','20261012_safety_automation.sql','20261016_face_verification.sql','20261101_multi_platform_identity.sql','20261102_android_ads.sql','20261102_account_transfer.sql','20261102_auth_cleanup.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 const login=async(provider,hash)=>(await db.query("select hb_social_auth($1,$2,$3,'login') id",[aid,provider,hash.repeat(64)])).rows[0].id;
 const a=await login('google','a'),b=await login('kakao','b');assert.notEqual(a,b);
 await db.query('delete from hb_members where id=$1',[a]);
 assert.equal((await db.query('select hb_claim_auth_cleanup($1,$2) claimed',[aid,['a'.repeat(64),'b'.repeat(64)]])).rows[0].claimed,false);
 assert.equal((await db.query('select balance from hb_members where id=$1',[b])).rows[0].balance,2000);
 await db.query('delete from hb_members where id=$1',[b]);
 const unmapped=(await db.query("select hb_social_login('google',$1) id",['c'.repeat(64)])).rows[0].id;
 assert.equal((await db.query('select hb_claim_auth_cleanup($1,$2) claimed',[aid,['c'.repeat(64)]])).rows[0].claimed,false);
 await db.query('delete from hb_members where id=$1',[unmapped]);
 await db.query("update hb_auth_cleanup set next_attempt_at=now() where auth_user_id=$1",[aid]);
 assert.equal((await db.query('select hb_claim_auth_cleanup($1,$2) claimed',[aid,['a'.repeat(64),'b'.repeat(64)]])).rows[0].claimed,true);
 assert.equal((await db.query('select hb_claim_auth_cleanup($1,$2) claimed',[aid,[]])).rows[0].claimed,false);
 await assert.rejects(login('google','a'),/정리 중/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from hb_auth_cleanup'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
const env={HB_AUTH_CLEANUP_ENABLED:'1',SUPABASE_SERVICE_ROLE_KEY:'private-fixture',HB_IDENTITY_HASH_KEY:'x'.repeat(32)};
test('worker checks all remote identities, honors ownership guard and never leaks profile or keys into persisted output',async()=>{
 const calls=[];let remoteDeletes=0;
 const options={env,url:'https://auth.example.test',db:async(path,opts)=>{calls.push({path,opts});return opts?[]:[{auth_user_id:aid}];},send:async(_,opts)=>{if(opts.method==='DELETE'){remoteDeletes++;return {ok:true};}return {ok:true,status:200,json:async()=>({id:aid,email:'private@example.test',identities:[{provider:'google',identity_data:{sub:'g'}},{provider:'kakao',identity_data:{sub:'k'}}]})};},run:async(_,args)=>{assert.equal(args.p_subject_hashes.length,2);return false;}};
 await cleanupAuthUsers(options);assert.equal(remoteDeletes,0);assert.equal(calls.length,1);
 const result=await cleanupAuthUsers({...options,run:async()=>true});assert.equal(result.completed,1);assert.equal(remoteDeletes,1);
 assert.ok(!JSON.stringify(calls).includes('private@example.test'));assert.ok(!JSON.stringify(calls).includes(env.SUPABASE_SERVICE_ROLE_KEY));
});
test('delete failure remains retryable; remote absence completes safely; disabled path has no external effects',async()=>{
 assert.deepEqual(await cleanupAuthUsers({env:{},db:()=>assert.fail('no DB')}),{enabled:false});
 const base={env,url:'https://auth.example.test',db:async(_,opts)=>opts?[]:[{auth_user_id:aid}],run:async()=>true};
 await assert.rejects(cleanupAuthUsers({...base,send:async(_,opts)=>opts.method==='DELETE'?{ok:false,status:503}:{ok:true,status:200,json:async()=>({id:aid,identities:[]})}}),/retry_required/);
 assert.equal((await cleanupAuthUsers({...base,send:async(_,opts)=>{assert.notEqual(opts.method,'DELETE');return {status:404};}})).completed,1);
});
test('cleanup-enabled login records only server-verified Auth identity and disabled mode preserves existing behavior',async()=>{
 const proof={authUserId:aid,provider:'google',subjectHash:'a'.repeat(64)};let called;
 await socialAuthMember(proof,'login',null,null,{env,run:async(name,args)=>{called={name,args};return 'member';}});
 assert.equal(called.name,'hb_social_auth');assert.equal(called.args.p_auth_user,aid);
 await socialAuthMember(proof,'login',null,null,{env:{},run:async name=>{assert.equal(name,'hb_social_login');}});
});
