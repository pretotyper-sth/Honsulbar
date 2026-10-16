import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {visibleCheck,captureFacePair,profileCanSave} from '../src/photo-verification.js';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function faceBox('),source.indexOf('function faceRegionLooksLikeSkin('));
const face={topLeft:[120,100],bottomRight:[320,360],probability:[.99],landmarks:[[175,190],[265,190],[220,245],[220,290]]};
test('photo screening rejects missing landmarks, tiny faces and low confidence',()=>{
 const env={};vm.createContext(env);vm.runInContext(helpers,env);
 assert.equal(env.isLikelyRealFace(face,480,480),true);
 for(const candidate of [{...face,probability:[.4]},{...face,probability:undefined},{...face,topLeft:[0,0],bottomRight:[20,20]},{...face,landmarks:[]}])assert.equal(env.isLikelyRealFace(candidate,480,480),false);
});
test('fast success and failure remain visible for 1.5s; slow checks get no added delay',async()=>{
 let time=0;const waits=[];const opts={now:()=>time,wait:async ms=>waits.push(ms)};
 assert.equal(await visibleCheck(async()=>{time=100;return 'ok';},opts),'ok');assert.deepEqual(waits,[1400]);
 time=0;waits.length=0;await assert.rejects(visibleCheck(async()=>{time=500;throw new Error('fail');},opts),/fail/);assert.deepEqual(waits,[1000]);
 time=0;waits.length=0;await visibleCheck(async()=>{time=2000;},opts);assert.deepEqual(waits,[]);
});
test('photo changes need current consent, verification and proof even after a prior success',()=>{
 const state={changed:true,consent:true,verified:true,proof:'proof'};assert.equal(profileCanSave(state),true);
 for(const change of [{consent:false},{verified:false},{proof:null}])assert.equal(profileCanSave({...state,...change}),false);
 assert.equal(profileCanSave({changed:false}),true);
});
function captureEnv(sizes){
 let time=0,frame=0,active=true;const cleared=[];
 const canvas={width:480,height:480,getContext:()=>({drawImage(){},clearRect(){cleared.push(true);}}),toDataURL:()=>`frame-${frame++}`};
 return {cleared,cancel:()=>{active=false;},options:{canvas,video:{videoWidth:480,videoHeight:480,readyState:4},model:{estimateFaces:async()=>{const size=sizes.shift()??240;return size===0?[]:[{...face,bottomRight:[120+size,360]}];}},motion:'near',framed:()=>true,onProgress(){},current:()=>active,wait:async ms=>{time+=ms;},now:()=>time}};
}
test('capture requires sustained requested movement and clears the canvas',async()=>{
 const {options,cleared}=captureEnv([200,200,240,240,240]);const result=await captureFacePair(options);
 assert.equal(result.length,2);assert.notEqual(result[0],result[1]);assert.equal(cleared.length,1);
});
test('no face, wrong movement, cancellation and camera disconnect do not produce evidence',async()=>{
 const absent=captureEnv(Array(60).fill(0));await assert.rejects(captureFacePair(absent.options),/얼굴 전체/);
 const wrong=captureEnv(Array(60).fill(200));await assert.rejects(captureFacePair(wrong.options),/가까이/);
 const cancelled=captureEnv([200]);cancelled.options.wait=async()=>cancelled.cancel();await assert.rejects(captureFacePair(cancelled.options),/취소/);
 const disconnected=captureEnv([200]);disconnected.options.video.readyState=0;await assert.rejects(captureFacePair(disconnected.options),/카메라/);
});
test('revoking consent while the server is checking cannot revive verification',async()=>{
 let release;const response=new Promise(resolve=>{release=resolve;});const results=[];
 const env={document:{createElement:()=>({})},AbortController,verificationController:{current:null},setVerificationStartedAt(){},setVerificationGuide(){},faceConsentRef:{current:true},verificationAttempt:{current:0},captureLock:{current:false},verificationState:'ready',cameraVideo:{current:{}},cameraCanvas:{current:{}},cameraStream:{current:{getVideoTracks:()=>[{readyState:'live'}]}},photoDraft:'photo',loadFaceModel:async()=>({}),visibleCheck:task=>task(),captureFacePair:async()=>['frame1','frame2'],run:async action=>action==='photo-challenge'?{id:'id',motion:'near'}:response,setPhotoProof:p=>results.push(p),setDraftVerified:v=>results.push(v),setVerificationState(){},setVerificationMessage(){}};
 vm.createContext(env);const a=source.indexOf('  async function captureVerification('),b=source.indexOf("\n  if (screen === 'onboarding')",a);vm.runInContext(source.slice(a,b),env);
 const work=env.captureVerification();await new Promise(resolve=>setImmediate(resolve));
 env.faceConsentRef.current=false;env.verificationAttempt.current++;release({proof:'late-proof'});await work;
 assert.ok(!results.includes('late-proof'));assert.ok(!results.includes(true));
});

test('capture recovers from a briefly missing face and gives measurable movement feedback',async()=>{
 const {options}=captureEnv([200,200,200,200,0,200,215,240,240,240]);
 const updates=[];options.onProgress=(message,detail)=>updates.push({message,...detail});
 const frames=await captureFacePair(options);
 assert.equal(frames.length,2);
 assert.ok(updates.some(item=>item.stage==='align'));
 assert.ok(updates.some(item=>item.stage==='move'&&item.progress>0));
 assert.ok(updates.some(item=>/얼굴/.test(item.message)&&item.progress===0));
});
test('wrong movement gives corrective direction and timeout names the requested action',async()=>{
 const {options}=captureEnv([...Array(4).fill(200),...Array(60).fill(170)]);
 const messages=[];options.onProgress=message=>messages.push(message);
 await assert.rejects(captureFacePair(options),/가까이/);
 assert.ok(messages.some(message=>/반대/.test(message)));
});

test('moving farther completes only after sustained movement in the requested direction',async()=>{
 const {options}=captureEnv([200,200,200,160,160,160]);options.motion='far';
 const updates=[];options.onProgress=(message,guide)=>updates.push({message,...guide});
 assert.equal((await captureFacePair(options)).length,2);
 assert.ok(updates.some(item=>item.motion==='far'&&item.progress===100));
});
test('photo requests abort on cancellation and timeout, including while reading a response',async()=>{
 const api=readFileSync(new URL('../src/api.js',import.meta.url),'utf8');
 const requestSource=api.slice(api.indexOf('async function request('),api.indexOf('\nexport const getConfig'));
 let expire,requestSignal,cleared=0;
 const env={AbortController,API_BASE:'',token:null,setToken(){},ApiError:class extends Error {constructor(message,status){super(message);this.status=status;}},setTimeout(fn){expire=fn;return 1;},clearTimeout(){cleared++;},fetch:async(_url,options)=>{requestSignal=options.signal;return {ok:true,status:200,json:()=>new Promise((_resolve,reject)=>requestSignal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))};}};
 vm.createContext(env);vm.runInContext(requestSource,env);
 const controller=new AbortController();
 const cancelled=env.request({action:'photo-verify'},'POST',{signal:controller.signal});
 await new Promise(resolve=>setImmediate(resolve));controller.abort();
 await assert.rejects(cancelled,/중단/);assert.equal(requestSignal.aborted,true);
 const timedOut=env.request({action:'photo-challenge'});await new Promise(resolve=>setImmediate(resolve));expire();
 await assert.rejects(timedOut,/지연/);assert.equal(cleared,2);
});
