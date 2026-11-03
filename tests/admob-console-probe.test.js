import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import handler from '../api/admob-ssv.js';

test('console probe requires a genuine signature and never reads or changes member data',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const originalFetch=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async url=>{
    assert.equal(url,'https://www.gstatic.com/admob/reward/verifier-keys.json');
    requests++;
    return {ok:true,json:async()=>({keys:[{keyId:19,pem:publicKey.export({type:'spki',format:'pem'})}]})};
  };
  const query=`ad_unit=4040671916&custom_data=00000000-0000-0000-0000-000000000000&timestamp=${Date.now()}&transaction_id=abcdef123456`;
  const signed=`${query}&signature=${sign('sha256',Buffer.from(query),privateKey).toString('base64url')}&key_id=19`;
  const response=()=>({code:null,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  try {
    const valid=response();await handler({method:'GET',url:`/api/admob-ssv?${signed}`},valid);
    assert.equal(valid.code,200);assert.deepEqual(valid.body,{ok:true,probe:true});
    const tampered=response();await handler({method:'GET',url:`/api/admob-ssv?${signed.replace('4040671916','4040671917')}`},tampered);
    assert.equal(tampered.code,403);
    const unsigned=response();await handler({method:'GET',url:`/api/admob-ssv?${query}`},unsigned);
    assert.equal(unsigned.code,400);assert.equal(requests,1);
  } finally {globalThis.fetch=originalFetch;}
});
