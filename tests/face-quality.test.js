import test from 'node:test';
import assert from 'node:assert/strict';
import {faceQualityError,comparisonError} from '../server/face-quality.js';
function fixture(){
 const width=320,height=320,data=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=100+((x+y)%4)*25;data[i+3]=255;}
 const mesh=Array.from({length:468},()=>[160,160,0]);
 for(const [i,p] of Object.entries({33:[105,115,0],133:[135,115,0],362:[185,115,0],263:[215,115,0],1:[160,155,0],61:[135,195,0],291:[185,195,0],13:[160,195,0],10:[160,70,0],152:[160,250,0],234:[75,160,0],454:[245,160,0]}))mesh[i]=p;
 return {image:{width,height,data},result:{face:[{box:[70,60,180,200],boxScore:.98,faceScore:.99,mesh,rotation:{angle:{yaw:0,pitch:0}},live:.95,embedding:Array(1024).fill(.1)}],hand:[]}};
}
test('quality gates accept measurable frontal features and reject incomplete, occluded or ambiguous inputs',()=>{
 let {image,result}=fixture();assert.equal(faceQualityError(result,image,{capture:true}),null);
 assert.match(faceQualityError({face:[]},image),/찾지 못/);
 assert.match(faceQualityError({face:[...result.face,...result.face]},image),/여러 얼굴/);
 for(const patch of [{faceScore:.5},{boxScore:.3},{mesh:[]},{rotation:{angle:{yaw:.8,pitch:0}}},{embedding:[NaN]}])assert.ok(faceQualityError({face:[{...result.face[0],...patch}]},image));
 assert.match(faceQualityError({...result,hand:[{label:'hand',score:.9,box:[120,60,120,230]}]},image),/손을 내려/);
 assert.equal(faceQualityError({...result,hand:[{label:'hand',score:.9,box:[0,0,40,40]}]},image),null);
 for(let y=95;y<135;y++)for(let x=80;x<155;x++){const i=(y*320+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=170;}
 assert.match(faceQualityError(result,image),/가린 곳/);
 ({image,result}=fixture());result.face[0].live=.1;assert.match(faceQualityError(result,image,{capture:true}),/실제 얼굴/);
});
test('all three identity comparisons and the server-selected motion must pass',()=>{
 const results=[{embedding:[1],scale:.4},{embedding:[2],scale:.4},{embedding:[3],scale:.5}];
 assert.equal(comparisonError(results,()=>.8,'near'),null);
 for(const failed of [0,1,2]){let index=0;assert.match(comparisonError(results,()=>index++===failed ? .2 : .8,'near'),/사진과 얼굴/);}
 assert.match(comparisonError(results,()=>NaN,'near'),/사진과 얼굴/);
 assert.match(comparisonError(results,()=>.8,'far'),/움직여/);
});
