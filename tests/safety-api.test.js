import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/service.js';
import {signPhoto,photoMatches,identityKey} from '../server/platform.js';
import {decodePhoto,verifyPhoto} from '../server/photo-verification.js';
import jpeg from 'jpeg-js';

test('production rejects preview and developer login even when their secrets match',async()=>{
 const previous={...process.env};
 Object.assign(process.env,{VERCEL_ENV:'production',HB_DEV_LOGIN:'1',HB_WEB_PREVIEW:'test-secret'});
 try{
  const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
  await handler({method:'POST',headers:{},body:{action:'dev-login',key:'9001',preview:'test-secret'}},response);
  assert.equal(response.statusCode,404);
  await handler({method:'GET',headers:{},query:{}},response);
  assert.equal(response.body.devLogin,false);
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
});

test('photo links expire and cannot be moved to another member or version',()=>{
 const now=Date.now(),expires=Math.floor(now/1000)+120;
 const signature=signPhoto('photo',4,'viewer',expires);
 assert.equal(photoMatches('photo',4,'viewer',expires,signature,now),true);
 assert.equal(photoMatches('photo',5,'viewer',expires,signature,now),false);
 assert.equal(photoMatches('photo',4,'other',expires,signature,now),false);
 assert.equal(photoMatches('photo',4,'viewer',expires,signature,now+121000),false);
});

test('restriction identifiers require a server secret and change with the underlying account',()=>{
 const previous=process.env.HB_IDENTITY_HASH_KEY;
 try{
  delete process.env.HB_IDENTITY_HASH_KEY;assert.throws(()=>identityKey('1234'),/設定|설정/);
  process.env.HB_IDENTITY_HASH_KEY='s'.repeat(32);
  assert.equal(identityKey('1234').length,64);
  assert.notEqual(identityKey('1234'),identityKey('5678'));
 }finally{if(previous===undefined)delete process.env.HB_IDENTITY_HASH_KEY;else process.env.HB_IDENTITY_HASH_KEY=previous;}
});

test('the bundled model rejects blank images and repeated capture frames',async()=>{
 const raw={width:128,height:128,data:Buffer.alloc(128*128*4,255)};
 const first=`data:image/jpeg;base64,${jpeg.encode(raw,80).data.toString('base64')}`;
 const last=`data:image/jpeg;base64,${jpeg.encode(raw,81).data.toString('base64')}`;
 assert.equal(decodePhoto(first).width,128);
 assert.throws(()=>decodePhoto('data:image/jpeg;base64,AAAA'),/촬영/);
 await assert.rejects(verifyPhoto(first,[first,first],'near'),/움직인/);
 await assert.rejects(verifyPhoto(first,[first,last],'near'),/얼굴을 찾지 못/);
});
