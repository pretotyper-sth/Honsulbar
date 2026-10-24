import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/maintenance.js';

test('maintenance accepts the existing cron key, never a raw DB key or untrusted bearer',async()=>{
 const previous={...process.env},send=global.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'database-secret',CRON_SECRET:'cron-secret'});
 let requests=0;
 global.fetch=async()=>{requests++;return new Response('null',{status:200});};
 const res=()=>({code:200,setHeader(){},status(code){this.code=code;return this;},end(){},json(value){this.body=value;return this;}});
 try {
  for(const token of ['', 'database-secret', 'invalid']){
   const response=res();await handler({headers:{authorization:`Bearer ${token}`}},response);assert.equal(response.code,401);
  }
  assert.equal(requests,0);
  for(const token of ['cron-secret']){
   const response=res();await handler({headers:{authorization:`Bearer ${token}`}},response);assert.equal(response.code,200);assert.equal(response.body.ok,true);
  }
  for(const stage of ['retention','notifications']){
   let calls=0;
   global.fetch=async()=>++calls===(stage==='retention'?1:2)?new Response(JSON.stringify({code:'PGRST202',message:'private database detail'}),{status:404}):new Response('null',{status:200});
   const response=res();await handler({headers:{authorization:'Bearer cron-secret'}},response);
   assert.equal(response.code,503);
   assert.deepEqual(response.body,{error:'maintenance_failed',stage,databaseStatus:404,databaseCode:'PGRST202'});
  }
 }finally{global.fetch=send;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});
