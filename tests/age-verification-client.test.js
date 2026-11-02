import test from 'node:test';import assert from 'node:assert/strict';
import {openAgeTest,pendingAgeTest,clearAgeTest,ageCallbackId} from '../src/age-verification.js';
const id='ha-1793586000-'+ 'a'.repeat(16)+'-'+ 'b'.repeat(32);
function storage(){let value;return {setItem:(key,next)=>{value=next;},getItem:()=>value,removeItem:()=>{value=null;}};}
test('native age flow sends only an opaque attempt ID and binds recovery to the current session',async()=>{
 const s=storage();let opened;
 await openAgeTest({id,test:true},'session-hash','https://honsulbar-app.vercel.app',{storage:s,now:1000,browser:{open:async value=>{opened=value;}}});
 assert.equal(new URL(opened.url).pathname,'/age-verification.html');assert.equal(new URL(opened.url).searchParams.get('attemptId'),id);
 assert.equal(pendingAgeTest('session-hash',{storage:s,now:2000}).id,id);
 assert.equal(pendingAgeTest('other-session',{storage:s,now:2000}),null);
 assert.equal(pendingAgeTest('session-hash',{storage:s,now:2000}),null);
 await openAgeTest({id,test:true},'session-hash','https://honsulbar-app.vercel.app',{storage:s,now:1000,browser:{open:async()=>{}}});
 assert.equal(pendingAgeTest('session-hash',{storage:s,now:602000}),null);
});
test('native age flow rejects insecure hosts, live attempts and smuggled callbacks',async()=>{
 const s=storage(),browser={open:()=>assert.fail('must not open')};
 for(const base of ['http://localhost','https://user:secret@honsulbar-app.vercel.app','https://honsulbar-app.vercel.app/path'])await assert.rejects(openAgeTest({id,test:true},'session',base,{storage:s,browser}));
 await assert.rejects(openAgeTest({id,test:false},'session','https://honsulbar-app.vercel.app',{storage:s,browser}));
 const callback=`com.honsulbar.app://identity/callback?id=${id}`;assert.equal(ageCallbackId(callback),id);
 for(const value of [callback+'&id=other',callback+'#fragment',callback.replace('identity','user@identity'),callback.replace('identity','identity:123'),callback.replace('/callback','/other')])assert.equal(ageCallbackId(value),null);
});
test('browser open failure clears the pending attempt',async()=>{
 const s=storage();await assert.rejects(openAgeTest({id,test:true},'session','https://honsulbar-app.vercel.app',{storage:s,now:1000,browser:{open:async()=>{throw Error('offline');}}}));assert.equal(pendingAgeTest('session',{storage:s,now:2000}),null);clearAgeTest(id,s);
});
