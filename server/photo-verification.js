import {Worker} from 'node:worker_threads';
import jpeg from 'jpeg-js';
import {AppError} from './platform.js';
export function decodePhoto(value){
 if(typeof value!=='string'||value.length>400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw new AppError('사진을 다시 촬영해 주세요.');
 try{
  const image=jpeg.decode(Buffer.from(value.split(',')[1],'base64'),{useTArray:true,maxResolutionInMP:1,maxMemoryUsageInMB:32});
  if(image.width<96||image.height<96||image.width>720||image.height>720)throw new Error('dimensions');
  return image;
 }catch{throw new AppError('얼굴이 잘 보이는 사진을 다시 촬영해 주세요.');}
}

let worker,loading,readyResolve,readyReject,initTimer,queue=Promise.resolve(),waiting=0,nextId=0;
const pending=new Map();
function reset(message){
 const error=new AppError(message,503),old=worker;
 worker=null;loading=null;clearTimeout(initTimer);readyReject?.(error);readyResolve=null;readyReject=null;
 for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();
 old?.terminate().catch(()=>{});
}
export function warmPhotoVerifier(){
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const current=new Worker(new URL('./photo-inference.js',import.meta.url),{execArgv:[]});
 worker=current;
 initTimer=setTimeout(()=>reset('얼굴 검사 준비가 지연돼요. 다시 시도해 주세요.'),15000);
 current.on('message',message=>{
  if(worker!==current)return;
  if(message.initError){reset('얼굴 검사를 준비하지 못했어요. 다시 시도해 주세요.');return;}
  if(message.ready){clearTimeout(initTimer);readyResolve?.();readyResolve=null;readyReject=null;current.unref();return;}
  const item=pending.get(message.id);if(!item)return;
  pending.delete(message.id);clearTimeout(item.timer);
  if(message.error)item.reject(new AppError(message.error));else item.resolve(message.result);
  current.unref();
 });
 current.on('error',()=>{if(worker===current)reset('검사를 마치지 못했어요. 다시 해주세요.');});
 current.on('exit',()=>{if(worker===current)reset('얼굴 검사 연결이 끊겼어요. 다시 시도해 주세요.');});
 return loading;
}
export async function verifyPhoto(photo,frames,motion){
 if(!Array.isArray(frames)||frames.length!==2||!['near','far'].includes(motion))throw new AppError('얼굴 확인을 다시 시작해 주세요.');
 if(waiting>=2)throw new AppError('검사가 몰리고 있어요. 잠시 후 다시 시도해 주세요.',503);
 waiting++;
 const work=queue.then(async()=>{
  await warmPhotoVerifier();
  return new Promise((resolve,reject)=>{
   const id=++nextId;
   const timer=setTimeout(()=>reset('검사 시간이 길어졌어요. 다시 시도해 주세요.'),45000);
   pending.set(id,{resolve,reject,timer});worker.ref();worker.postMessage({id,photo,frames,motion});
  });
 });
 queue=work.catch(()=>{});
 try{return await work;}finally{waiting--;}
}
