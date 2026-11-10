import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/useFullVoiceRecording.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').split('export function useFullVoiceRecording')[0];
const {startFullVoiceRecording}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('full recorder flushes on exit, retries upload and stops when reservation fails',async()=>{
 const instances=[],timers=new Map(),requests=[];let timer=0,failures=0,uploadAttempts=0;
 class Recorder{
  static isTypeSupported(type){return type==='audio/webm;codecs=opus';}
  constructor(){this.state='inactive';instances.push(this);}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob([new Uint8Array(32)])});this.onstop();}
 }
 const stop=startFullVoiceRecording({stream:{},visitId:'visit',Recorder,
  schedule:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},cancel:id=>timers.delete(id),
  onFailure:()=>failures++,request:async(action,data)=>{
   requests.push({action,data});
   if(action==='recording-upload'){if(++uploadAttempts<3)throw Error('retry');return {};}
   return {result:{id:'chunk-'+requests.length}};
  }});
 await tick();assert.equal(instances.length,1);assert.equal(instances[0].state,'recording');
 assert.ok([...timers.values()].some(item=>item.ms===29000));
 stop();await tick();assert.equal(requests.find(item=>item.action==='recording-upload').data.id,'chunk-1');assert.equal(uploadAttempts,3);assert.equal(timers.size,0);assert.equal(failures,0);
 startFullVoiceRecording({stream:{},visitId:'visit',Recorder,onFailure:()=>failures++,request:async()=>{throw Error('quota');}});
 await tick();assert.equal(failures,1);assert.equal(instances.length,1);
});
