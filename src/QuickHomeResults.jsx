import React, {useState} from 'react';
import {Button} from './ui';
import {CAPACITY} from './model';
import {Eye} from 'lucide-react';

export function QuickHomeResults({rooms,preferredRegion,previews,subscription,paused,onPreview,onEnter,onFirstGuest,onCancel}) {
  const regions=[...new Set(rooms.map(room=>room.region))].sort((a,b)=>a===preferredRegion?-1:b===preferredRegion?1:a.localeCompare(b));
  const [choice,setChoice]=useState(preferredRegion);
  const selected=regions.includes(choice)?choice:regions[0];
  return <>
    <div className="lobby-heading"><h1>지금 열려 있는 혼술바</h1><p className="sheet-description">미리 보고 마음에 드는 곳을 골라보세요.</p></div>
    <div className="regions" role="group" aria-label="열려 있는 지역">{regions.map(region=><Button key={region} size="small" variant="weak" color={selected===region?'primary':'dark'} aria-pressed={selected===region} onClick={()=>setChoice(region)}>{region}</Button>)}</div>
    <div className="quick-results-list">
      {rooms.filter(room=>room.region===selected).map(room=><section className="quick-result-card" key={room.region+':'+room.number}>
        <div className="quick-result-title"><strong>{room.region} {room.number}호점</strong><span>{room.count>=CAPACITY?'만석':'입장 가능'}</span></div>
        <div className="quick-result-actions">
          <Button size="small" variant="weak" disabled={paused} onClick={()=>onPreview(room)}><Eye size={16}/>{previews[room.region+':'+room.number]?'구매한 미리보기':subscription?'구독으로 미리보기':'미리보기 · 500P'}</Button>
          <Button size="small" disabled={paused||room.count>=CAPACITY} onClick={()=>onEnter(room)}>{room.count>=CAPACITY?'만석이에요':'입장하기'}</Button>
        </div>
      </section>)}
    </div>
    <div className="lobby-footer">
      <Button variant="weak" display="block" disabled={paused} onClick={onFirstGuest}>내가 만들고 기다리기</Button>
      <Button color="dark" variant="weak" display="block" onClick={onCancel}>홈으로</Button>
    </div>
  </>;
}
