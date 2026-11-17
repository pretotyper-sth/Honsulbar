import React, {useEffect,useRef,useState} from 'react';
import {scenarios,setScenario} from './quick-search';
import leftVoice from './audio/left.wav?inline';
import rightVoice from './audio/right.wav?inline';
import './qa.css';

const requestedScenario = new URLSearchParams(location.search).get('qa');
const initialScenario = scenarios.some(([, cases])=>cases.some(([id])=>id===requestedScenario)) ? requestedScenario : 'many';
setScenario(initialScenario);

const voiceSamples = { left:leftVoice, right:rightVoice };
const sideFor = (seat, guestSeat) => guestSeat < (seat === 11 ? 5 : seat) ? 'left' : 'right';
const sideLabel = { left:'왼쪽 손님', right:'오른쪽 손님' };

function DirectionAudio({ guests, seat, gains, pans, prepareAudio }) {
  const playback = useRef(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const audio = playback.current;
    if (!audio) return;
    for (const { id, gain, pan } of audio.nodes) {
      gain.gain.setTargetAtTime(gains[id] ?? 0, audio.context.currentTime, .08);
      pan?.pan.setTargetAtTime(pans[id] ?? 0, audio.context.currentTime, .08);
    }
  }, [gains, pans, status]);

  function stop() {
    const audio = playback.current;
    playback.current = null;
    if (!audio) return;
    audio.abort.abort();
    for (const { source, gain, pan } of audio.nodes) {
      source.stop();
      source.disconnect();
      gain.disconnect();
      pan?.disconnect();
    }
  }
  useEffect(() => stop, []);

  async function toggle() {
    if (playback.current) {
      stop();
      setStatus('idle');
      return;
    }
    const context = prepareAudio();
    if (!context) return;
    const audio = { context, abort:new AbortController(), nodes:[] };
    playback.current = audio;
    setStatus('loading');
    try {
      const buffers = await Promise.all(guests.map(async guest => {
        const side = sideFor(seat, guest.seat);
        const response = await fetch(voiceSamples[side], { signal:audio.abort.signal });
        if (!response.ok) throw new Error('QA voice sample unavailable');
        return { id:guest.id, side, buffer:await context.decodeAudioData(await response.arrayBuffer()) };
      }));
      if (playback.current !== audio) return;
      const startAt = context.currentTime + .05;
      for (const { id, side, buffer } of buffers) {
        const source = context.createBufferSource();
        const gain = context.createGain();
        const pan = context.createStereoPanner?.();
        source.buffer = buffer;
        source.loop = true;
        gain.gain.value = 0;
        source.connect(gain);
        if (pan) {
          gain.connect(pan);
          pan.connect(context.destination);
        } else gain.connect(context.destination);
        source.start(startAt + (side === 'right' ? .65 : 0));
        audio.nodes.push({ id, source, gain, pan });
      }
      setStatus('playing');
    } catch {
      if (playback.current !== audio) return;
      stop();
      setStatus('error');
    }
  }

  const enabled = status === 'playing' || status === 'loading';
  return <div className="qa-direction">
    <button type="button" onClick={toggle} aria-pressed={enabled}>{enabled ? '샘플 대화 끄기' : '샘플 대화 듣기'}</button>
    <span role="status">{status === 'error' ? '샘플 대화를 불러오지 못했어요.' :
      status === 'loading' ? '샘플 대화를 불러오는 중이에요.' :
      guests.map(({id,seat:guestSeat}) => `${guestSeat + 1}번 ${sideLabel[sideFor(seat, guestSeat)]} ${Math.round((gains[id] || 0) * 100)}%`).join(' · ')}</span>
  </div>;
}

export default function QuickSearchQa({App}) {
  const [revision,setRevision]=useState(0);
  const [active,setActive]=useState(initialScenario);
  const [open,setOpen]=useState(false);
  const view=active==='bar-first'||active==='bar-swap-first'?'first':active==='bar-flat'?'flat':undefined;
  const retry=active.startsWith('home-camera-retry-')?active.split('-').at(-1):undefined;
  const start=active==='bar-camera'||retry?'profile':active==='home-inquiry'?'inquiry'
    :active.startsWith('bar-swap-') && !['bar-swap-out','bar-swap-no'].includes(active)?'incoming':undefined;
  return <App key={revision} qaView={view} QaDirectionAudio={active==='bar-host-direction'||active==='bar-guest-direction'?DirectionAudio:undefined} qaStart={start} qaPhotoRetry={retry} qaViewGuide={active==='view-guide'} qaControls={
    <>
      <button type="button" className="qa-trigger" aria-expanded={open} aria-controls="qa-scenarios" onClick={()=>setOpen(value=>!value)}>QA 테스트</button>
      {open && <section id="qa-scenarios" className="qa-scenarios" aria-label="QA 시나리오" onKeyDown={e=>{if(e.key==='Escape')setOpen(false);}}>
        <div className="qa-heading">
          <h2>QA 테스트</h2>
          <button type="button" onClick={()=>setOpen(false)}>닫기</button>
        </div>
        {scenarios.map(([name,cases])=><div key={name} className="qa-group">
          <h3>{name}</h3>
          <div>
            {cases.map(([id,label,hint])=><button key={id} type="button" aria-pressed={active===id} onClick={()=>{
              setScenario(id);
              setActive(id);
              setRevision(value=>value+1);
              setOpen(false);
            }}>{label}{hint && <small>{hint}</small>}</button>)}
          </div>
        </div>)}
      </section>}
    </>
  }/>;
}
