import React, {useState} from 'react';
import {scenarios,setScenario} from './quick-search';
import './qa.css';

export default function QuickSearchQa({App}) {
  const [revision,setRevision]=useState(0);
  const [active,setActive]=useState('many');
  const [open,setOpen]=useState(false);
  const view=active==='bar-first'||active==='bar-swap-first'?'first':active==='bar-flat'?'flat':undefined;
  const start=active==='bar-camera'?'profile':active==='home-inquiry'?'inquiry'
    :active.startsWith('bar-swap-') && !['bar-swap-out','bar-swap-no'].includes(active)?'incoming':undefined;
  return <App key={revision} qaView={view} qaStart={start} qaViewGuide={active==='view-guide'} qaControls={
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
