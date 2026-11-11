import React, {useState} from 'react';
import {scenarios,setScenario} from './quick-search';

export default function QuickSearchQa({App}) {
 const [revision,setRevision]=useState(0);
 const [active,setActive]=useState('many');
 const [open,setOpen]=useState(false);
 return <App key={revision} qaControls={
   <div style={{position:'relative',fontSize:12}}>
     <button type="button" style={{whiteSpace:'nowrap',color:'#fff',background:'#242424',border:0,borderRadius:6,padding:'5px 7px'}} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>QA 테스트</button>
     {open && <div style={{position:'absolute',top:'calc(100% + 10px)',right:'-20px',zIndex:20,width:200,display:'flex',gap:6,flexWrap:'wrap',padding:8,background:'#242424',borderRadius:6}}>
       {scenarios.map(([id,label])=><button key={id} type="button" aria-pressed={active===id} style={{padding:'4px 8px',border:0,borderRadius:4,background:active===id?'#b0d2ff':'#fff',color:'#111'}} onClick={()=>{
         setScenario(id);
         setActive(id);
         setRevision(value=>value+1);
         setOpen(false);
       }}>{label}</button>)}
     </div>}
   </div>
 }/>;
}
