import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { tossSfuPilot, tossSfuReady, tossSfuSession } from '../server/toss-sfu.js';
import { positionsByDistance, sfuTrackIds } from '../src/sfu-selection.js';

const env = {
  HB_TOSS_SFU_ENABLED:'1', LIVEKIT_API_KEY:'test-key', LIVEKIT_API_SECRET:'test-secret',
  LIVEKIT_URL:'wss://example.livekit.cloud', HB_TOSS_SFU_PILOT_ROOM:'대구:1',
};
function fixture(overrides = {}) {
  return {member:{photoChecked:true},visit:{id:'visit',region:'대구',number:1,seconds:120},guests:[{id:'b'}],...overrides};
}
const session = (state,partnerId=null) => tossSfuSession('a',state,{visitId:'visit',partnerId},{env,now:10_000});

test('SFU grants short-lived, bar-specific tokens for active visits', () => {
  assert.deepEqual(tossSfuPilot(env),{region:'대구',number:1});
  assert.equal(tossSfuPilot({...env,HB_TOSS_SFU_ENABLED:'0'}),null);
  assert.equal(tossSfuReady({...env,HB_TOSS_SFU_PILOT_ROOM:''}),true);
  const {url,token} = session(fixture());
  const [head,body,sig] = token.split('.');
  const claims = JSON.parse(Buffer.from(body,'base64url'));
  assert.equal(sig,createHmac('sha256','test-secret').update(head+'.'+body).digest('base64url'));
  assert.equal(url,env.LIVEKIT_URL);
  assert.equal(claims.exp,130);
  assert.deepEqual(claims.video.canPublishSources,['microphone']);
  assert.equal(claims.video.canPublishData,false);
  const other = session(fixture({visit:{...fixture().visit,number:2}})).token;
  assert.notEqual(JSON.parse(Buffer.from(other.split('.')[1],'base64url')).video.room,claims.video.room);
  for (const state of [fixture({safetyPaused:true}),fixture({visit:{...fixture().visit,away:true}})]) {
    assert.throws(()=>session(state),{status:403});
  }
});

test('a private room token requires a current reciprocal pair and cannot be issued for a stale public view', () => {
  const paired = fixture({partners:{a:'b',b:'a'}});
  assert.throws(()=>session(paired),{status:409});
  const claims = token => JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  const privateRoom = claims(session(paired,'b').token).video.room;
  const partner = tossSfuSession('b',{...paired,guests:[{id:'a'}]},{visitId:'visit',partnerId:'a'},{env});
  assert.equal(claims(partner.token).video.room,privateRoom);
  assert.notEqual(claims(session(fixture()).token).video.room,privateRoom);
  assert.throws(()=>session(fixture({partners:{a:'b'}}),'b'),{status:409});
  assert.throws(()=>session({...paired,reportedIds:['b']},'b'),{status:409});
});

test('nearby seats remain ready and only audible speakers are considered for distant ambience', () => {
  const guests = ['near','two','three','far','host','old','blocked'].map((id,index)=>({id,seat:index+1,speaker:id==='host'}));
  const gains = Object.fromEntries(guests.map(person=>[person.id,1]));
  const nearby = positionsByDistance(guests,guests.filter(person=>person.id!=='blocked').map(p=>p.id),0,gains);
  const chosen = sfuTrackIds(nearby,new Map([['far',1000],['old',50],['blocked',1000]]),500);
  assert.ok(chosen.includes('near'));
  assert.ok(chosen.includes('host'));
  assert.ok(chosen.includes('far'));
  assert.ok(!chosen.includes('old') && !chosen.includes('blocked'));
  assert.deepEqual(sfuTrackIds(nearby,new Map(),500,'far'),['far']);
});
