import test from 'node:test';
import assert from 'node:assert/strict';
import {newPhotoChallenge} from '../server/photo-test-window.js';
const now=Date.now();
const limited=()=>{throw new Error('얼굴 확인 시도가 많아요. 잠시 후 다시 시도해 주세요.');};
function db({expired=false, adult=true, banned=false, count=0, permit=true}={}) {
 const calls=[];
 const database=async(path,options)=>{
  calls.push([path,options]);
  if(path.startsWith('hb_events?'))return permit?[{created_at:new Date(now-1000).toISOString(),data:{expiresAt:new Date(now+(expired?-1:60000)).toISOString()}}]:[];
  if(path.startsWith('hb_members?'))return [{adult,banned_until:banned?new Date(now+60000).toISOString():null}];
  if(path.startsWith('hb_photo_challenges?'))return Array(count).fill({id:'old'});
  if(path==='hb_photo_challenges')return [{id:'fresh',motion:options.body.motion}];
  throw new Error(path);
 };
 return {database,calls};
}
test('ordinary challenge uses normal atomic SQL limit',async()=>{
 const {database,calls}=db();
 assert.deepEqual(await newPhotoChallenge('member',{database,rpc:async()=>({id:'normal'}),now}),{id:'normal'});
 assert.equal(calls.length,0);
});
test('active scoped allowance creates a normal fresh movement challenge',async()=>{
 const {database,calls}=db();
 const result=await newPhotoChallenge('member',{database,rpc:limited,now});
 assert.equal(result.id,'fresh');assert.ok(['near','far'].includes(result.motion));
 assert.ok(calls[0][0].includes('member_id=eq.member'));
 assert.equal(calls.at(-1)[1].body.member_id,'member');
});
for(const [name,settings] of Object.entries({expired:{expired:true},missing:{permit:false},minor:{adult:false},banned:{banned:true},capped:{count:36}}))test(`allowance rejects ${name}`,async()=>{
 const {database,calls}=db(settings);
 await assert.rejects(newPhotoChallenge('member',{database,rpc:limited,now}),/시도가 많아요/);
 assert.ok(!calls.some(([path])=>path==='hb_photo_challenges'));
});
test('unrelated RPC failure is never bypassed',async()=>{
 const {database,calls}=db();
 await assert.rejects(newPhotoChallenge('member',{database,rpc:async()=>{throw new Error('network');},now}),/network/);
 assert.equal(calls.length,0);
});
