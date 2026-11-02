import test from 'node:test';import assert from 'node:assert/strict';
import { startAgeTest, completeAgeTest, AGE_TEST_CHANNEL } from '../server/age-verification.js';
const env={HB_AGE_TEST_ENABLED:'1',HB_PORTONE_API_SECRET:'secret-for-fixture-only'.repeat(2),HB_IDENTITY_HASH_KEY:'h'.repeat(32)};
const now=Date.parse('2026-11-02T01:00:00Z');
const fixture=id=>({id,status:'VERIFIED',channel:{type:'TEST',key:AGE_TEST_CHANNEL},verifiedAt:new Date(now).toISOString(),verifiedCustomer:{birthDate:'2007-11-02',name:'private',phoneNumber:'private',ci:'private'}});
test('age test verifies provider result and returns no personal data or production admission',async()=>{
 const {id}=startAgeTest('member-a',{env,now});assert.ok(id.length<=64);
 const result=await completeAgeTest('member-a',id,{env,now,fetcher:async(url,options)=>{assert.match(url,/^https:\/\/api\.portone\.io\/identity-verifications\//);assert.match(options.headers.Authorization,/^PortOne /);return {ok:true,json:async()=>fixture(id)};}});
 assert.deepEqual(result,{verified:true,adult:true,test:true,admissionGranted:false});
});
test('age test rejects another member, expired attempt, live channel, altered IDs and minors',async()=>{
 const {id}=startAgeTest('member-a',{env,now});const notCalled=()=>assert.fail('must reject before provider lookup');
 await assert.rejects(completeAgeTest('member-b',id,{env,now,fetcher:notCalled}));
 await assert.rejects(completeAgeTest('member-a',id,{env,now:now+600001,fetcher:notCalled}));
 for(const changes of [{status:'READY'},{id:'other'},{channel:{type:'LIVE',key:AGE_TEST_CHANNEL}},{channel:{type:'TEST',key:'other'}},{verifiedCustomer:{birthDate:'2007-11-03'}},{verifiedCustomer:{birthDate:'2007-02-30'}}])await assert.rejects(completeAgeTest('member-a',id,{env,now,fetcher:async()=>({ok:true,json:async()=>({...fixture(id),...changes})})}));
 assert.throws(()=>startAgeTest('member-a',{env:{...env,HB_AGE_TEST_ENABLED:'0'},now}));
});

test('identity health checks authorization without requesting an existing user record and caches probes',async()=>{
 const {ageTestHealth}=await import('../server/age-verification.js');let calls=0;
 const fetcher=async url=>{calls++;assert.match(url,/\/ha-probe-[a-f0-9]{32}\?/);return {status:404,json:async()=>({type:'IDENTITY_VERIFICATION_NOT_FOUND'})};};
 assert.deepEqual(await ageTestHealth({env,fetcher,now}),{configured:true,authorized:true,providerStatus:404});
 assert.equal((await ageTestHealth({env,fetcher,now:now+1000})).authorized,true);assert.equal(calls,1);
 assert.equal((await ageTestHealth({env:{...env,HB_PORTONE_API_SECRET:env.HB_PORTONE_API_SECRET+'bad'},now,fetcher:async()=>({status:401})})).authorized,false);
 assert.equal((await ageTestHealth({env:{...env,HB_AGE_TEST_ENABLED:'0'},fetcher:()=>assert.fail('disabled')})).configured,false);
});
