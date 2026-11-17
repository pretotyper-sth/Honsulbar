import React, {useEffect,useRef,useState} from 'react';
import {scenarios,setScenario} from './quick-search';
import './qa.css';

const requestedScenario = new URLSearchParams(location.search).get('qa');
const initialScenario = scenarios.some(([, cases])=>cases.some(([id])=>id===requestedScenario)) ? requestedScenario : 'many';
setScenario(initialScenario);

function DirectionAudio({ guests, gains, pans, prepareAudio }) {
  const tones = useRef(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = tones.current;
    if (!audio) return;
    for (const { id, gain, pan } of audio.nodes) {
      gain.gain.setTargetAtTime(.12 * (gains[id] ?? 0), audio.context.currentTime, .08);
      if (pan) pan.pan.setTargetAtTime(pans[id] ?? 0, audio.context.currentTime, .08);
    }
  }, [gains, pans, playing]);

  function stop() {
    if (!tones.current) return;
    for (const { tone, gain, pan } of tones.current.nodes) {
      tone.stop();
      tone.disconnect();
      gain.disconnect();
      pan?.disconnect();
    }
    tones.current = null;
  }
  useEffect(() => stop, []);

  function toggle() {
    if (tones.current) {
      stop();
      setPlaying(false);
      return;
    }
    const context = prepareAudio();
    if (!context) return;
    const nodes = guests.map(({ id }, index) => {
      const tone = context.createOscillator();
      const gain = context.createGain();
      const pan = context.createStereoPanner?.();
      tone.frequency.value = index % 2 ? 392 : 222;
      gain.gain.value = 0;
      tone.connect(gain);
      if (pan) {
        gain.connect(pan);
        pan.connect(context.destination);
      } else gain.connect(context.destination);
      tone.start();
      return { id, tone, gain, pan };
    });
    tones.current = { context, nodes };
    setPlaying(true);
  }

  return <div className="qa-direction">
    <button type="button" onClick={toggle} aria-pressed={playing}>{playing ? '테스트음 끄기' : '테스트음 켜기'}</button>
    <span>{guests.map(({id,seat}, index) => `${seat + 1}번 ${index % 2 ? '높은음' : '낮은음'} ${Math.round((gains[id] || 0) * 100)}%`).join(' · ')}</span>
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
