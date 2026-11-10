import { useEffect, useRef } from 'react';
import { call } from './api';

const TYPES = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'];

export function startFullVoiceRecording({ stream, visitId, request=call, Recorder=globalThis.MediaRecorder, onFailure, schedule=setTimeout, cancel=clearTimeout }) {
  const mime = TYPES.find(type=>Recorder?.isTypeSupported(type));
  if (!mime) { onFailure(new Error('이 기기에서 음성 안전 보관을 시작할 수 없어요.')); return ()=>{}; }
  let active=true,sequence=Date.now();
  const timers=new Set(),recorders=new Set(),uploads=new Set();
  const later=(task,ms)=>{
    const timer=schedule(()=>{timers.delete(timer);task();},ms);
    timers.add(timer);return timer;
  };
  const stop=()=>{
    active=false;
    timers.forEach(cancel);timers.clear();
    recorders.forEach(recorder=>{if(recorder.state!=='inactive')recorder.stop();});
  };
  const fail=error=>{
    if (!active) return;
    stop();onFailure(error);
  };
  async function upload(id,blob) {
    if (!blob.size || blob.size>196608) throw new Error('음성 보관 한도를 확인해 주세요.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    let binary='';
    for(let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const data={id,mime,audio:btoa(binary)};
    for(let attempt=0;attempt<3;attempt++){
      try {await request('recording-upload',data);return;}
      catch(error){if(attempt===2)throw error;}
    }
  }
  const reserve=async()=>{
    const response=await request('recording-allocate',{visitId,sequence:sequence++});
    if (!response.result?.id) throw new Error('음성 보관 연결을 확인해 주세요.');
    return response.result;
  };
  function launch(allocation) {
    if (!active) return;
    if (uploads.size>=2) {fail(new Error('음성 보관 연결이 지연돼요. 다시 입장해 주세요.'));return;}
    try {
      const chunks=[];
      const recorder=new Recorder(stream,{mimeType:mime,audioBitsPerSecond:24000});
      recorders.add(recorder);
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=()=>fail(new Error('음성 안전 보관을 계속할 수 없어요.'));
      recorder.onstop=()=>{
        recorders.delete(recorder);
        if (!chunks.length) return;
        const work=upload(allocation.id,new Blob(chunks,{type:mime}));
        uploads.add(work);
        work.catch(fail).finally(()=>uploads.delete(work));
      };
      recorder.start();
      later(()=>{if(recorder.state!=='inactive')recorder.stop();},30000);
      // Reserve ahead and overlap segments by one second to avoid gaps during upload.
      const next=reserve();
      next.catch(fail);
      later(()=>{next.then(launch).catch(fail);},29000);
    } catch(error){fail(error);}
  }
  reserve().then(launch).catch(fail);
  return stop;
}

export function useFullVoiceRecording({ enabled, stream, visitId, onFailure }) {
  const failure = useRef(onFailure);
  useEffect(() => { failure.current = onFailure; }, [onFailure]);
  useEffect(()=>{
    if (!enabled || !stream || !visitId) return;
    return startFullVoiceRecording({stream,visitId,onFailure: error => failure.current(error)});
  },[enabled,stream,visitId]);
}
