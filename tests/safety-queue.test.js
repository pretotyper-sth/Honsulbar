import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEmptySafetyQueue,safetySnapshot} from '../server/safety-queue.js';
const now=Date.parse('2026-11-03T12:00:00Z');
function setup({hours=25,reports=[],paused=false}={}) {
  const calls=[];
  return {calls,now,database:async path=>{calls.push(path);return path.startsWith('hb_safety_ops')?[{reviewed_at:new Date(now-hours*3600000).toISOString()}]:reports;},rpc:async(name,args)=>{calls.push({name,args});return name==='hb_safety_paused'?paused:null;}};
}
test('an empty queue resumes a stale pause and marks the check as automated',async()=>{
 const ctx=setup();assert.deepEqual(await checkEmptySafetyQueue(ctx),{resumed:true,reason:'verified-empty-queue'});
 assert.deepEqual(ctx.calls.find(x=>x.name==='hb_ops_ping').args,{p_email:'system:verified-empty-report-queue'});
 assert.ok(ctx.calls.some(x=>x.name==='hb_sync_safety_time'));
});
test('any unresolved report prevents automated acknowledgment',async()=>{
 const ctx=setup({reports:[{id:'report'}]});assert.equal((await checkEmptySafetyQueue(ctx)).reason,'open-reports');assert.ok(!ctx.calls.some(x=>x.name));
});
test('a recent check is not rewritten',async()=>{
 const ctx=setup({hours:1});assert.equal((await checkEmptySafetyQueue(ctx)).reason,'recent-check');assert.equal(ctx.calls.length,1);
});
test('an overdue report detected after the check remains paused',async()=>{
 assert.equal((await checkEmptySafetyQueue(setup({paused:true}))).resumed,false);
});
test('unavailable queue information fails closed without acknowledging',async()=>{
 const ctx=setup({reports:null});await assert.rejects(checkEmptySafetyQueue(ctx),/unavailable/);assert.ok(!ctx.calls.some(x=>x.name));
});
test('a paused snapshot is refreshed from the database after a successful empty queue check',async()=>{
 const ctx=setup(),rpc=ctx.rpc;let snapshots=0;
 ctx.rpc=async(name,args)=>name==='hb_snapshot'?{safetyPaused:++snapshots===1}:rpc(name,args);
 // Explicit historical timestamp ensures this path is stale independently of test clock.
 ctx.database=async path=>path.startsWith('hb_safety_ops')?[{reviewed_at:'2020-01-01T00:00:00Z'}]:[];
 assert.equal((await safetySnapshot({p_member:'test'},ctx)).safetyPaused,false);assert.equal(snapshots,2);
});
