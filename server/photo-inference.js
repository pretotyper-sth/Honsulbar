import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import jpeg from 'jpeg-js';
import * as tf from '@tensorflow/tfjs';
import {setWasmPaths,setThreadsCount} from '@tensorflow/tfjs-backend-wasm';
import {fileURLToPath} from 'node:url';
setWasmPaths(fileURLToPath(new URL('./vendor/',import.meta.url)));
setThreadsCount(1);
import humanModule from './vendor/human-cpu.cjs';
import {faceQualityError,comparisonError,mirrorImage} from './face-quality.js';
class AppError extends Error {}
const hash=value=>createHash('sha256').update(value).digest('hex');
tf.io.registerLoadRouter(url=>typeof url==='string'&&url.startsWith(new URL('./face-models/',import.meta.url).href)?{load:async()=>{
 const file=new URL(url),model=JSON.parse(await readFile(file,'utf8')),buffers=[];
 for(const group of model.weightsManifest)for(const path of group.paths)buffers.push(await readFile(new URL(path,file)));
 const bytes=Buffer.concat(buffers);
 return {...model,weightSpecs:model.weightsManifest.flatMap(group=>group.weights),weightData:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
}}:null);
const human=new humanModule.Human({backend:'wasm',wasmPath:fileURLToPath(new URL('./vendor/',import.meta.url)),cacheSensitivity:0,skipAllowed:false,modelBasePath:new URL('./face-models/',import.meta.url).href,filter:{enabled:false,return:false},face:{detector:{rotation:true,maxDetected:3,minConfidence:0.75,skipFrames:0,skipTime:0,return:false},mesh:{enabled:true},iris:{enabled:false},description:{enabled:true,crop:.08,skipFrames:0,skipTime:0},emotion:{enabled:false},antispoof:{enabled:false},liveness:{enabled:true,skipFrames:0,skipTime:0}},hand:{enabled:true,maxDetected:2,minConfidence:.35,landmarks:true,skipFrames:0,skipTime:0},body:{enabled:false},object:{enabled:false},gesture:{enabled:false},segmentation:{enabled:false}});
const ready=human.load();
export function decodePhoto(value){
 if(typeof value!=='string'||value.length>400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new AppError('사진을 다시 촬영해 주세요.');
 try{
  const image=jpeg.decode(Buffer.from(value.split(',')[1],'base64'),{useTArray:true,maxResolutionInMP:1,maxMemoryUsageInMB:32});
  if(image.width<96||image.height<96||image.width>720||image.height>720)throw new Error('dimensions');
  return image;
 }catch{throw new AppError('얼굴이 잘 보이는 사진을 다시 촬영해 주세요.');}
}

export async function analyzeFace(image,capture=false){
 await ready;
 const pixels=new Float32Array(image.width*image.height*3);
 for(let i=0,j=0;i<image.data.length;i+=4){pixels[j++]=image.data[i];pixels[j++]=image.data[i+1];pixels[j++]=image.data[i+2];}
 const tensor=tf.tensor3d(pixels,[image.height,image.width,3]);
 let result;
 try{
  result=await human.detect(tensor);
  if(result.error)throw new Error('inference');
  const error=faceQualityError(result,image,{capture});
  if(error)throw new AppError(error);
  const item=result.face[0];
  return {embedding:[...item.embedding],scale:Math.abs(item.mesh[454][0]-item.mesh[234][0])/image.width};
 }finally{
  tensor.dispose();pixels.fill(0);
  for(const item of result?.face||[]){item.embedding?.fill(0);for(const p of item.mesh||[])p.fill(0);}
  human.result.face=[];human.result.hand=[];
 }
}
export async function verifyImages(profile,frames,motion){
 const images=[],results=[];
 try{
  if(!Array.isArray(frames)||frames.length!==2||!['near','far'].includes(motion))throw new AppError('얼굴 확인을 다시 시작해 주세요.');
  if(hash(frames[0])===hash(frames[1]))throw new AppError('안내에 따라 움직인 뒤 다시 촬영해 주세요.');
  for(const value of [profile,...frames])images.push(decodePhoto(value));
  for(const [index,image] of images.entries()){
   try{results.push(await analyzeFace(image,index>0));}
   catch(error){if(error instanceof AppError)throw new AppError(`${index===0?'등록 사진':'촬영본'}: ${error.message}`);throw error;}
  }
  let alternateProfile=null;
  const mirrored=mirrorImage(images[0]);images.push(mirrored);
  try{alternateProfile=await analyzeFace(mirrored,false);results.push(alternateProfile);}
  catch(error){if(!(error instanceof AppError))throw error;}
  const error=comparisonError(results.slice(0,3),(a,b)=>human.match.similarity(a,b),motion,alternateProfile);
  if(error)throw new AppError(error);
  return {model:'human-3.3.6-face-v4',photoDigest:hash(profile)};
 }finally{
  for(const image of images)image.data.fill(0);
  for(const result of results)result.embedding.fill(0);
 }
}
if(parentPort){
 ready.then(()=>parentPort.postMessage({ready:true})).catch(()=>parentPort.postMessage({initError:true}));
 parentPort.on('message',async job=>{
  try{parentPort.postMessage({id:job.id,result:await verifyImages(job.photo,job.frames,job.motion)});}
  catch(error){parentPort.postMessage({id:job.id,error:error instanceof AppError?error.message:'검사를 마치지 못했어요. 다시 해주세요.'});}
  finally{job.photo=null;job.frames?.fill(null);}
 });
}
