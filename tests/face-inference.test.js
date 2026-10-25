import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import jpeg from 'jpeg-js';
import {verifyPhoto} from '../server/photo-verification.js';
function sample(person,size=220,cover=null,variation={}){
 const asset=person===0?'screenshot-faceid.jpg':'screenshot-facematch.jpg';
 const source=jpeg.decode(readFileSync(new URL(`../node_modules/@vladmandic/human/assets/${asset}`,import.meta.url)));
 const [sx,sy,sw,sh]=person===0?[14,142,140,140]:[0,26,170,167];
 const raw={width:320,height:320,data:Buffer.alloc(320*320*4,255)},offset=Math.floor((320-size)/2);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const from=((sy+Math.floor(y*sh/size))*source.width+sx+Math.floor(x*sw/size))*4,to=((offset+y)*320+offset+x)*4;
  source.data.copy(raw.data,to,from,from+4);
  if(variation.light)for(let channel=0;channel<3;channel++)raw.data[to+channel]=Math.max(0,Math.min(255,raw.data[to+channel]*.85+25));
  if(cover&&x<size/2){raw.data[to]=cover[0];raw.data[to+1]=cover[1];raw.data[to+2]=cover[2];}
 }
 if(variation.mirror){const original=Buffer.from(raw.data);for(let y=0;y<320;y++)for(let x=0;x<320;x++){const from=(y*320+x)*4,to=(y*320+319-x)*4;original.copy(raw.data,to,from,from+4);}}
 return `data:image/jpeg;base64,${jpeg.encode(raw,88).data.toString('base64')}`;
}
test('bundled models accept the same sample with scale change, reject another sample and half-face occlusion',async()=>{
 const profile=sample(0,220),first=sample(0,190),last=sample(0,240);
 const result=await verifyPhoto(profile,[first,last],'near');assert.equal(result.model,'human-3.3.6-face-v3');assert.equal(result.photoDigest.length,64);
 await assert.rejects(verifyPhoto(sample(1),[first,last],'near'),/사진과 얼굴/);
 for(const variation of [{mirror:true},{light:true},{mirror:true,light:true}])assert.equal((await verifyPhoto(sample(0,220,null,variation),[first,last],'near')).model,'human-3.3.6-face-v3');
 for(const cover of [[0,0,0],[190,145,110]])await assert.rejects(verifyPhoto(profile,[sample(0,190,cover),sample(0,240,cover)],'near'),/얼굴|가린|눈·코·입|고개를/);
});
