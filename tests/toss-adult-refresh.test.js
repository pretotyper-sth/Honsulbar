import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {isAdult,AppError} from '../server/platform.js';
const source=readFileSync(new URL('../api/service.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf("  if(action==='login'){"),source.indexOf("  if(action==='social-login'){"));
function fixture(info){
 const writes=[];
 const env={AppError,isAdult,body:{authorizationCode:'valid-code',referrer:'DEFAULT',adult:true},action:'login',isProduction:()=>true,process:{env:{}},toss:async path=>path.endsWith('login-me')?info:{accessToken:'verified-token'},decryptField:value=>value,identityKey:()=> 'verified-identity',hash:()=>'',database:async(path,options)=>{if(options)writes.push({path,...options});return [];},rpc:async()=> 'existing-member',res:{},startSession:async()=>({ok:true})};
 vm.createContext(env);vm.runInContext('async function execute(){'+block+'}',env);
 return {env,writes};
}
test('Toss-confirmed adult login refreshes a legacy member flag without storing identity source values',async()=>{
 const {env,writes}=fixture({userKey:'123456',birthday:'19900101',name:'시험 이름'});
 await env.execute();const update=writes.find(x=>x.path.startsWith('hb_members?'));
 assert.equal(update.method,'PATCH');assert.equal(update.body.adult,true);
 assert.equal(update.body.identity_key,'verified-identity');assert.ok(!('birthday' in update.body));assert.ok(!('name' in update.body));
});
test('client adult flags cannot refresh adulthood for an underage or incomplete Toss identity',async()=>{
 for(const info of [{userKey:'123',birthday:'20200101',name:'시험'},{userKey:'123',name:'시험'},{userKey:'123',birthday:'19900101'}]){
  const {env,writes}=fixture(info);await assert.rejects(env.execute());assert.equal(writes.length,0);
 }
});
