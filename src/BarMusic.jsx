import React, { useEffect, useId, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';

export function BarMusic({ volume, onChange, onOpen }) {
  const sliderId = useId();
  const control = useRef(null);
  const trigger = useRef(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const closeOutside = event => {
      if (!control.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [expanded]);

  return <div className="bar-music" ref={control} onKeyDown={event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.stopPropagation();
    setExpanded(false);
    trigger.current?.focus();
  }}>
    {expanded && <div className="bar-music-slider" id={sliderId}>
      <output>{Math.round(volume * 100)}%</output>
      <input type="range" aria-label="배경음악 음량" min="0" max="1" step="0.01"
        value={volume} style={{'--range-progress':`${volume * 100}%`}} onChange={event => onChange(Number(event.target.value))}/>
    </div>}
    <button ref={trigger} className="bar-stage-button bar-bgm-toggle" type="button"
      aria-label={volume === 0 ? '배경음악 · 음소거' : '배경음악'} aria-expanded={expanded}
      data-muted={volume === 0} aria-controls={expanded ? sliderId : undefined} onClick={() => {
        if (!expanded) onOpen();
        setExpanded(!expanded);
      }}>
      <Music2 size={15} aria-hidden="true"/>
    </button>
  </div>;
}
