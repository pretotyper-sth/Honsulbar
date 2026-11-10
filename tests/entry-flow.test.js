import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { entryRequirement } from '../src/entry-check.js';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url),'utf8');
const orderSource = source.slice(source.indexOf('  async function confirmOrder() {'),source.indexOf('  async function inspectProfilePhoto'));

test('a registered picture is not treated as a verified picture; adult and profile requirements stay distinct',()=>{
 const member={adult:true,photo:'/existing-picture',gender:'male',photoChecked:false};
 assert.equal(entryRequirement(member),'photo');
 assert.equal(entryRequirement({...member,photoChecked:true}),null);
 assert.equal(entryRequirement({...member,adult:false}),'adult');
 assert.equal(entryRequirement({...member,gender:null}),'profile');
});
function fixture(run){
 const changes=[];
 const env={busy:false,orderLock:{current:false},entering:{current:false},isWelcome:true,room:{region:'서울',number:1},selection:'highball',chosen:{name:'하이볼',minutes:30},run,resetConversation(){},setWaveSent(){},setSpeaker(){},setSoundOn(){},setMutedGuests(){},mesh:{resume(){}},setBusy(v){env.busy=v;},setError(v){changes.push(['error',v]);},setToast(v){changes.push(['toast',v]);},setSheet(v){changes.push(['sheet',v]);},setScreen(v){changes.push(['screen',v]);},setServer(){throw new Error('optimistic balance/visit must not be fabricated');}};
 vm.createContext(env);vm.runInContext(orderSource,env);return {env,changes};
}
test('failed entry keeps the drink sheet and does not flash a bar or invent a point deduction',async()=>{
 const {env,changes}=fixture(async()=>{throw new Error('얼굴 확인 필요');});await env.confirmOrder();
 assert.ok(!changes.some(([type])=>type==='screen'||type==='sheet'));
 assert.ok(changes.some(([type,value])=>type==='toast'&&value==='얼굴 확인 필요'));
 assert.equal(env.busy,false);assert.equal(env.entering.current,false);
});
test('entry waits for the server, blocks double taps and does not undo success for playback errors',async()=>{
 let complete,calls=0;
 const {env,changes}=fixture(()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
 env.mesh.resume=()=>{throw new Error('playback unavailable');};
 const pending=env.confirmOrder();await env.confirmOrder();
 assert.equal(calls,1);assert.ok(!changes.some(([type])=>type==='sheet'||type==='screen'));
 complete({});await pending;
 assert.deepEqual(changes.filter(([type])=>type==='sheet'),[['sheet',null]]);
 assert.ok(changes.some(([type,value])=>type==='toast'&&value.includes('시작')));
 assert.equal(env.orderLock.current,false);
});

const gateSource=source.slice(source.indexOf('  function proceedEntry('),source.indexOf('  useEffect(() => {\n    if (pendingEntry'));
test('registered but unverified profile is sent to verification before the drink picker',()=>{
 const calls=[];
 const env={entryRequirement,hasVoiceConsent:true,member:{adult:true,photo:'/existing',gender:'male',photoChecked:false},region:'서울',setEntryRoom:()=>{},setPendingEntry:()=>{},openProfileEditor:()=>calls.push('profile'),leftoverFor:()=>false,open:value=>calls.push(value),setSelection:()=>{}};
 vm.createContext(env);vm.runInContext(gateSource,env);env.proceedEntry({number:1});
 assert.deepEqual(calls,['profile']);
});
test('existing unverified pictures are loaded for the same camera verification instead of requiring reupload',async()=>{
 const code=source.slice(source.indexOf('  async function openProfileEditor('),source.indexOf('  async function saveProfile()'));
 const calls=[],drafts=[];
 const env={member:{photo:'/signed-picture',photoChecked:false,nickname:'테스트',gender:'male'},photoInspect:{current:0},assetUrl:value=>value,randomNickname:()=> '랜덤',setProfile:()=>{},setPhotoDraft:value=>drafts.push(value),setDraftVerified:value=>calls.push(['verified',value]),setPhotoProof:()=>{},changeFaceConsent:()=>{},setPhotoCheck:value=>calls.push(['check',value]),open:()=>{},setToast:()=>{},setError:()=>{},fetch:async()=>({ok:true,blob:async()=>({})}),resizePhoto:async()=> 'data:image/jpeg;base64,existing-picture'};
 vm.createContext(env);vm.runInContext(code,env);await env.openProfileEditor();
 assert.equal(drafts.at(-1),'data:image/jpeg;base64,existing-picture');
 assert.ok(calls.some(([type,value])=>type==='check'&&value==='ok'));
 assert.ok(!calls.some(([type,value])=>type==='verified'&&value===true));
});
