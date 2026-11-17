import React, { useId, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

export function BarMusic({ volume, onChange }) {
  const sliderId = useId();
  const trigger = useRef(null);
  const [expanded, setExpanded] = useState(false);

  return <div className="bar-music" onKeyDown={event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.stopPropagation();
    setExpanded(false);
    trigger.current?.focus();
  }}>
    {expanded && <div className="bar-music-slider" id={sliderId}>
      <output>{Math.round(volume * 100)}%</output>
      <input type="range" aria-label="배경음악 음량" min="0" max="1" step="0.01"
        value={volume} onChange={event => onChange(Number(event.target.value))}/>
    </div>}
    <button ref={trigger} className="bar-stage-button" type="button"
      aria-label="배경음악 음량 조절" aria-expanded={expanded}
      aria-controls={expanded ? sliderId : undefined} onClick={() => setExpanded(value => !value)}>
      <SlidersHorizontal size={18} aria-hidden="true"/>
    </button>
  </div>;
}
