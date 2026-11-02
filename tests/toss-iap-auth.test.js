import test from 'node:test';import assert from 'node:assert/strict';import handler from '../api/toss-iap.js';
async function invoke(authorization){const res={code:200,setHeader(){},status(c){this.code=c;return this;},json(v){this.body=v;return this;},end(){return this;}};await handler({method:'POST',headers:{authorization},body:{eventType:'callback.registration_verification'}},res);return res;}
test('Toss IAP fails closed without configured authentication and rejects wrong credentials',async()=>{
 const saved=process.env.TOSS_IAP_BASIC_AUTH;try{
 delete process.env.TOSS_IAP_BASIC_AUTH;assert.equal((await invoke()).code,503);
 process.env.TOSS_IAP_BASIC_AUTH='fixture-user:fixture-password';assert.equal((await invoke('Basic attacker')).code,401);
 assert.equal((await invoke('Basic '+Buffer.from(process.env.TOSS_IAP_BASIC_AUTH).toString('base64'))).code,204);
 }finally{if(saved===undefined)delete process.env.TOSS_IAP_BASIC_AUTH;else process.env.TOSS_IAP_BASIC_AUTH=saved;}
});
