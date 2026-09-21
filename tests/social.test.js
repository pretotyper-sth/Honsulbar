import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjacent, audioGain, directionGain, validPartners, drinkLevel, claimAttendance } from '../src/social.js';
import { purchase,initialWallet } from '../src/model.js';

test('curved lower seats remain adjacent; ends and host cannot form a pair',()=>{
  assert.equal(adjacent(4,5),true);assert.equal(adjacent(5,6),true);
  assert.equal(adjacent(0,10),false);assert.equal(adjacent(10,11),false);
});
test('turning continuously quiets the opposite side without changing the facing side',()=>{
  assert.equal(directionGain(3,2,-90),1);
  assert.ok(Math.abs(directionGain(3,4,-90)-.05)<1e-10);
  assert.ok(directionGain(3,4,-45)>directionGain(3,4,-90));
  assert.equal(directionGain(3,4,0),1);
  assert.equal(directionGain(11,4,-90),1);
  assert.ok(directionGain(11,4,90)<1);
});
test('mutual focus gates both incoming and outgoing sound including host',()=>{
  const me={id:'me',seat:3},left={id:'left',seat:2},right={id:'right',seat:4},host={id:'host',seat:11};
  const partners=validPartners([me,left,right,host],[['me','left']]);
  assert.equal(audioGain(me,left,0,partners),1);
  assert.equal(audioGain(me,left,90,partners),1);
  assert.equal(audioGain(me,right,0,partners),0);
  assert.equal(audioGain(right,me,0,partners),0);
  assert.equal(audioGain(host,me,0,partners),0);
  assert.equal(audioGain(me,left,0,partners,['left']),0);
  assert.deepEqual(validPartners([{...me,seat:8},left],[['me','left']]),{});
});
test('busy neighbors cannot join a second pair',()=>{
  const people=[{id:'a',seat:1},{id:'b',seat:2},{id:'c',seat:3}];
  assert.deepEqual(validPartners(people,[['a','b'],['b','c']]),{a:'b',b:'a'});
});
test('drink fill caps at thirty minutes; warning only in final minute',()=>{
  assert.deepEqual(drinkLevel(1800),{fill:1,low:false});
  assert.equal(drinkLevel(3600).fill,1);assert.equal(drinkLevel(900).fill,.5);
  assert.equal(drinkLevel(61).low,false);assert.equal(drinkLevel(60).low,true);
  assert.equal(drinkLevel(0).fill,0);assert.equal(drinkLevel(-20).fill,0);
  assert.deepEqual(drinkLevel(10,true),{fill:1,low:false});
});
test('attendance is once per day and survives a drink purchase',()=>{
  const day='2026-09-21';const earned=claimAttendance(initialWallet,day);
  assert.equal(earned.balance,2000);assert.equal(claimAttendance(earned,day),earned);
  const ordered=purchase(earned,'beer',1000000);
  assert.equal(claimAttendance(ordered,day).balance,1500);
  assert.equal(claimAttendance(ordered,'2026-09-22').balance,2500);
});
