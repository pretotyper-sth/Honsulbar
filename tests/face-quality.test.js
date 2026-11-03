import test from 'node:test';
import assert from 'node:assert/strict';
import {faceQualityError,comparisonError,mirrorImage} from '../server/face-quality.js';
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
 assert.match(faceQualityError({face:[...result.face,...result.face]},image),/혼자/);
 for(const patch of [{faceScore:.5},{boxScore:.3},{mesh:[]},{rotation:{angle:{yaw:.8,pitch:0}}},{embedding:[NaN]}])assert.ok(faceQualityError({face:[{...result.face[0],...patch}]},image));
 assert.equal(faceQualityError({...result,hand:[{label:'hand',score:.9,box:[120,60,120,230]}]},image),null);
 assert.equal(faceQualityError({...result,hand:[{label:'hand',score:.9,box:[0,0,40,40]}]},image),null);
 for(let y=95;y<135;y++)for(let x=80;x<155;x++){const i=(y*320+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=170;}
 assert.match(faceQualityError(result,image),/눈·입을 가리지/);
 ({image,result}=fixture());result.face[0].live=.1;assert.match(faceQualityError(result,image,{capture:true}),/실제 얼굴/);
});
test('profile matching tolerates bounded variation but live continuity and selected motion must pass',()=>{
 const results=[{embedding:[1],scale:.4},{embedding:[2],scale:.4},{embedding:[3],scale:.5}];
 assert.equal(comparisonError(results,()=>.8,'near'),null);
 for(const failed of [0,1,2]){let index=0;assert.match(comparisonError(results,()=>index++===failed ? .2 : .8,'near'),/등록 사진과 달라|촬영본이/);}
 assert.match(comparisonError(results,()=>NaN,'near'),/밝은 곳/);
 assert.match(comparisonError(results,()=>.8,'far'),/움직여/);
});

test('profile decisions require both scores in one orientation, not a different mirror per frame',()=>{
 const results=[{embedding:[1],scale:.4},{embedding:[2],scale:.4},{embedding:[3],scale:.5}],flipped={embedding:[4]};
 const score=values=>(a,b)=>values[`${a[0]}:${b[0]}`]??.8;
 assert.equal(comparisonError(results,score({'1:2':.53,'1:3':.60}),'near'),null);
 assert.match(comparisonError(results,score({'1:2':.29,'1:3':.9}),'near'),/등록 사진과 달라/);
 assert.equal(comparisonError(results,score({'1:2':.2,'1:3':.2,'4:2':.6,'4:3':.58}),'near',flipped),null);
 assert.match(comparisonError(results,score({'1:2':.7,'1:3':.2,'4:2':.2,'4:3':.7}),'near',flipped),/등록 사진과 달라/);
 assert.match(comparisonError(results,score({'2:3':.4}),'near',flipped),/촬영본이/);
});
test('mirroring preserves pixels and never changes the source image',()=>{
 const image={width:2,height:1,data:new Uint8Array([1,2,3,255,4,5,6,255])};
 const flipped=mirrorImage(image);
 assert.deepEqual([...flipped.data],[4,5,6,255,1,2,3,255]);
 assert.deepEqual([...mirrorImage(flipped).data],[...image.data]);
 assert.notEqual(flipped.data,image.data);
});

test('clipped forehead and jaw do not reject visible core facial features',()=>{
 const {image,result}=fixture();
 for(const index of [10,152,234,454])result.face[0].mesh[index]=[-10,330,0];
 assert.equal(faceQualityError(result,image,{capture:true}),null);
 result.face[0].mesh[33]=[-10,115,0];
 assert.match(faceQualityError(result,image,{capture:true}),/눈·코·입/);
});

test('lighting, detail quality and photo mismatch have distinct actionable errors',()=>{
 const {image,result}=fixture();
 for(const [level,message] of [[5,/어두워요/],[250,/너무 밝아요/],[170,/눈·입을 가리지/]]){
  for(let i=0;i<image.data.length;i+=4)image.data[i]=image.data[i+1]=image.data[i+2]=level;
  assert.match(faceQualityError(result,image),message);
 }
 const frames=[{embedding:[1],scale:.4},{embedding:[2],scale:.4},{embedding:[3],scale:.5}];
 const mismatch=comparisonError(frames,(a)=>a[0]===1?.2:.8,'near');
 assert.match(mismatch,/등록 사진과 달라/);
 assert.doesNotMatch(mismatch,/밝은 곳/);
 assert.match(comparisonError(frames,(a)=>a[0]===1?NaN:.8,'near'),/밝은 곳/);
});


test('a false hand box cannot reject a clear face; actual missing detail still fails',()=>{
 const {image,result}=fixture();
 result.hand=[{label:'hand',score:.99,box:[60,50,220,250]}];
 assert.equal(faceQualityError(result,image,{capture:true}),null);
 for(let y=95;y<135;y++)for(let x=80;x<155;x++){
  const i=(y*image.width+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=170;
 }
 assert.match(faceQualityError(result,image,{capture:true}),/눈·입을 가리지/);
});

test('moderate profile variation passes while weak matches still fail',()=>{
 const frames=[{embedding:[1],scale:.4},{embedding:[2],scale:.4},{embedding:[3],scale:.5}];
 assert.equal(comparisonError(frames,(a,b)=>a[0]===1?(b[0]===2?.44:.54):.8,'near'),null);
 assert.match(comparisonError(frames,a=>a[0]===1?.28:.8,'near'),/등록 사진과 달라/);
});
test('profile accepts moderate confidence and angle without loosening capture gates',()=>{
 const {image,result}=fixture();
 Object.assign(result.face[0],{boxScore:.78,faceScore:.85,box:[70,60,64,100],rotation:{angle:{yaw:.48,pitch:.45}}});
 assert.equal(faceQualityError(result,image),null);
 assert.ok(faceQualityError(result,image,{capture:true}));
});

test('relaxed profile matching accepts lower scores with consistent live identity, but not zero similarity',()=>{
 const frames=[{embedding:[1],scale:.4},{embedding:[2],scale:.4},{embedding:[3],scale:.5}];
 assert.equal(comparisonError(frames,(a,b)=>a[0]===1?(b[0]===2?.35:.47):.8,'near'),null);
 assert.match(comparisonError(frames,a=>a[0]===1?.1:.8,'near'),/등록 사진과 달라/);
 assert.match(comparisonError(frames,(a,b)=>a[0]===2?.4:.5,'near'),/촬영본이/);
});
