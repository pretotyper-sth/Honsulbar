import React, { useEffect, useId, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';

export function BarMusic({ src }) {
  const audio = useRef(null);
  const sliderId = useId();
  const trigger = useRef(null);
  const [volume, setVolume] = useState(0.5);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const player = audio.current;
    player.volume = volume;
  }, [volume]);

  useEffect(() => {
    const player = audio.current;
    player.play().catch(() => {});
  }, [src]);

  function toggle() {
    if (audio.current.paused) audio.current.play().catch(() => {});
    setExpanded(value => !value);
  }

  return <div className="bar-music" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) {
      event.stopPropagation();
      setExpanded(false);
      trigger.current.focus();
    }
  }}>
    <audio ref={audio} src={src} loop />
    {expanded && <div className="bar-music-slider" id={sliderId}>
      <output>{Math.round(volume * 100)}%</output>
      <input type="range" aria-label="배경음악 음량" min="0" max="1" step="0.01"
        value={volume} onChange={event => setVolume(Number(event.target.value))} />
    </div>}
    <button ref={trigger} type="button" aria-label="배경음악 음량 조절" aria-expanded={expanded}
      aria-controls={expanded ? sliderId : undefined} onClick={toggle}>
      <Music2 size={18} aria-hidden="true" />
    </button>
  </div>;
}
