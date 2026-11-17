import test from 'node:test';
import assert from 'node:assert/strict';
import {nextVisitTick, secondsOnVisitClock, syncVisitClock} from '../src/visit-clock.js';

function snapshot(visit = {}, clockSampleMs = 100_000) {
  return {clockSampleMs,visit:{id:'bar-visit',seat:4,seconds:20,clockEndMs:120_000,...visit}};
}

test('uneven snapshot arrivals and seat moves never reset the running second boundary', () => {
  let clock=syncVisitClock(null,snapshot(),250);
  const anchor=clock;
  const arrivals=[650,1400,2780,3390,5440,9680,11030,17250,20040];
  for(let second=0, poll=0;second<=20;second++){
    const now=250+second*1000;
    while(arrivals[poll]&&arrivals[poll]<=now){
      const receivedAt=arrivals[poll++];
      clock=syncVisitClock(clock,snapshot({seat:5,seconds:Math.max(0,20-second)},100_000+receivedAt-360),receivedAt,'heartbeat');
      assert.equal(clock,anchor);
    }
    assert.equal(secondsOnVisitClock(clock,now),20-second);
  }
});

test('server pause, resume, away/rejoin and a real extension use the correct timeline',()=>{
  let clock=syncVisitClock(null,snapshot({seconds:1200,soloPaused:true,clockEndMs:null}),400);
  assert.equal(secondsOnVisitClock(clock,7000),1200);
  clock=syncVisitClock(clock,snapshot({seconds:1200,clockEndMs:1_305_398},105_500),6000);
  assert.equal(secondsOnVisitClock(clock,5300),1200);
  assert.equal(secondsOnVisitClock(clock,6897),1200);
  assert.equal(secondsOnVisitClock(clock,6898),1199);
  const away=syncVisitClock(clock,snapshot({away:true,clockEndMs:1_305_398},106_700),7200,'leave');
  assert.equal(away,clock);
  assert.equal(syncVisitClock(away,snapshot({clockEndMs:1_305_398},107_700),8200,'enter'),clock);
  clock=syncVisitClock(clock,snapshot({clockEndMs:3_705_398},108_000),8500,'order');
  assert.equal(secondsOnVisitClock(clock,8500),3598);
  clock=syncVisitClock(clock,{...snapshot({seconds:3597,clockEndMs:null}),safetyPaused:true},9000);
  assert.equal(secondsOnVisitClock(clock,12000),3597);
  clock=syncVisitClock(clock,snapshot({seat:11,seconds:3597,clockEndMs:null}),12500,'move');
  assert.equal(secondsOnVisitClock(clock,15000),3597);
});

test('older servers keep the original running phase and new ticks align to the deadline',()=>{
  const body=seconds=>({visit:{id:'legacy',seat:2,seconds}});
  const clock=syncVisitClock(null,body(20),250);
  assert.equal(syncVisitClock(clock,body(19),1400,'heartbeat'),clock);
  assert.equal(syncVisitClock(clock,body(18),2400,'move'),clock);
  assert.equal(secondsOnVisitClock(clock,2249),19);
  assert.equal(secondsOnVisitClock(clock,2250),18);
  const extended=syncVisitClock(clock,body(58),2301,'order');
  assert.equal(secondsOnVisitClock(extended,2249),58);
  assert.equal(nextVisitTick(clock.deadline,2249),1);
  assert.equal(nextVisitTick(clock.deadline,2250),1000);
  assert.equal(nextVisitTick(clock.deadline,20250),null);
});
