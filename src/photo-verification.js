export const MIN_CHECK_MS = 1500;
export const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
export async function visibleCheck(task,{minimum=MIN_CHECK_MS,now=Date.now,wait=pause}={}){
 const started=now();
 try{return await task();}finally{const remaining=minimum-(now()-started);if(remaining>0)await wait(remaining);}
}
export function profileCanSave({changed,consent,verified,proof}){
 return !changed||Boolean(consent&&verified&&proof);
}
export async function captureFacePair({video,canvas,model,motion,framed,onProgress,current,wait=pause,now=Date.now}){
 const frames=[];
 const near=motion==='near';
 if(!['near','far'].includes(motion))throw new Error('얼굴 확인을 다시 시작해 주세요.');
 const instruction=near?'휴대폰을 조금 가까이 해주세요.':'휴대폰을 조금 멀리해 주세요.';
 const report=(message,stage,progress=0)=>onProgress(message,{stage,motion,progress});
 const check=()=>{if(!current())throw new Error('검사가 취소됐어요.');if(!video.videoWidth||video.readyState<2)throw new Error('카메라를 다시 열어 주세요.');};
 const sample=async()=>{
  check();
  const scale=Math.min(1,480/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  const faces=await model.estimateFaces(canvas,false);check();
  if(faces.length!==1)return {error:faces.length?'혼자 화면 가운데에 맞춰 주세요.':'얼굴을 화면에 맞춰 주세요.'};
  const face=faces[0];
  if(!framed(face,canvas.width,canvas.height))return {error:'눈·코·입을 화면 안에 맞춰 주세요.'};
  const size=(Number(face.bottomRight[0])-Number(face.topLeft[0]))/canvas.width;
  if(!Number.isFinite(size)||size<=0)return {error:'얼굴을 화면에 맞춰 주세요.'};
  return {size};
 };
 try{
  const alignStarted=now();let first=0,previous=0,lastIssue='얼굴을 정면으로 맞춰 주세요.';
  report('정면을 보고 잠시 멈춰 주세요.','align');
  while(now()-alignStarted<8000){
   const sampleResult=await sample();
   if(sampleResult.error){previous=0;lastIssue=sampleResult.error;report(lastIssue,'align');}
   else if(previous&&Math.abs(sampleResult.size/previous-1)<.08){first=sampleResult.size;frames.push(canvas.toDataURL('image/jpeg',.88));break;}
   else {previous=sampleResult.size;report('정면을 보고 잠시 멈춰 주세요.','align');}
   await wait(220);
  }
  if(!first)throw new Error(lastIssue);
  const started=now();let stable=0;
  report(instruction,'move');
  while(now()-started<10000){
   await wait(220);check();
   const sampleResult=await sample();
   if(sampleResult.error){stable=0;report(sampleResult.error,'move');continue;}
   const ratio=sampleResult.size/first;
   const moved=near?ratio>=1.16&&ratio<1.75:ratio<=.85&&ratio>.58;
   const wrong=near?ratio<.94:ratio>1.06;
   const tooMuch=near?ratio>=1.75:ratio<=.58;
   stable=moved?stable+1:0;
   const progress=Math.max(0,Math.min(100,Math.round((near?ratio-1:1-ratio)/(near?.16:.15)*100)));
   const message=moved?'좋아요. 잠시 멈춰 주세요.':wrong?(near?'반대예요. 가까이 해주세요.':'반대예요. 멀리해 주세요.'):tooMuch?(near?'조금만 뒤로 가 주세요.':'조금만 다가와 주세요.'):instruction;
   report(message,'move',tooMuch?0:progress);
   if(stable>=2&&now()-started>=500){frames.push(canvas.toDataURL('image/jpeg',.88));return frames;}
  }
  throw new Error(`${near?'가까이':'멀리'} 움직여 다시 찍어 주세요.`);
 }catch(error){frames.fill(null);throw error;}
 finally{canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);}
}
