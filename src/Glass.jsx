import React, { useId } from 'react';
import { DRINKS } from './model';
import { drinkLevel } from './social';

export function Glass({id,className='',seconds=1800,host=false}) {
  const clip=useId().replaceAll(':','');
  const {fill,low}=drinkLevel(seconds,host);
  const color=DRINKS.find(d=>d.id===id)?.color || '#ddb76d';
  const stroke=low ? '#df9c98' : '#d8cdb8';
  const wine=id==='wine',beer=id==='beer';
  const top=wine?7:beer?12:10, bottom=wine?27:40;
  const surface=bottom-(bottom-top)*fill;
  const bowl=wine?'M10 5h20l-2 16c-1 9-15 9-16 0Z':beer?'M8 10h22v30H8Z':'m9 8 3 34h17l3-34Z';
  return <svg className={`glass ${low?'glass-low':''} ${className}`} viewBox="0 0 40 48" fill="none" aria-hidden="true">
    <defs><clipPath id={clip}><path d={bowl}/></clipPath></defs>
    <path d={bowl} fill="#e8ded414"/>
    <g clipPath={`url(#${clip})`}><rect x="8" y={surface} width="24" height={bottom-surface+1} fill={color} opacity={fill>0?.9:0}/>{beer&&fill>0&&<rect x="8" y={surface} width="24" height="3" fill="#f3e8ca"/>}</g>
    <path d={bowl} stroke={stroke} strokeWidth={low?1.8:1.4}/>
    {wine?<path d="M20 28v13m-8 2h16" stroke={stroke} strokeWidth="1.5" strokeLinecap="round"/>:beer?<path d="M30 13h3c7 0 7 17-1 17h-2" stroke={stroke} strokeWidth="2"/>:<><path d="m24 28 7-26" stroke="#eee7d8" strokeWidth="1.3"/><path d="M10 9a7 7 0 0 1 12 1Z" fill={id==='citrus'?'#c5d37f':'#e2d485'}/></>}
  </svg>;
}
