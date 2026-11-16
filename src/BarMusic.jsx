import React, { useEffect, useId, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { normalizeBarMusic } from './bar-music-level';

export function BarMusic({ src }) {
  const audio = useRef(null);
  const audioGraph = useRef(null);
  const sliderId = useId();
  const trigger = useRef(null);
  const [volume, setVolume] = useState(0.5);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const player = new Audio(src);
    player.loop = true;
    audio.current = player;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    // Media from another origin can be silenced by a MediaElementAudioSourceNode.
    if (AudioContext && new URL(player.src).origin === window.location.origin) {
      let context;
      try {
        context = new AudioContext();
        const normalizer = normalizeBarMusic(context, player);
        audioGraph.current = { context, normalizer };
      } catch {
        context?.close().catch(() => {});
      }
    }

    function play() {
      const context = audioGraph.current?.context;
      if (context && context.state !== 'running') context.resume().catch(() => {});
      if (player.paused) player.play().catch(() => {});
    }

    // Retry after a gesture if the browser blocks autoplay or suspends Web Audio.
    document.addEventListener('pointerup', play, true);
    document.addEventListener('keydown', play, true);
    play();
    return () => {
      document.removeEventListener('pointerup', play, true);
      document.removeEventListener('keydown', play, true);
      player.pause();
      player.removeAttribute('src');
      player.load();
      const graph = audioGraph.current;
      audioGraph.current = null;
      graph?.normalizer.close();
      graph?.context.close().catch(() => {});
    };
  }, [src]);

  useEffect(() => {
    if (audioGraph.current) audioGraph.current.normalizer.setVolume(volume);
    else audio.current.volume = volume;
  }, [src, volume]);

  return <div className="bar-music" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) {
      event.stopPropagation();
      setExpanded(false);
      trigger.current.focus();
    }
  }}>
    {expanded && <div className="bar-music-slider" id={sliderId}>
      <output>{Math.round(volume * 100)}%</output>
      <input type="range" aria-label="배경음악 음량" min="0" max="1" step="0.01"
        value={volume} onChange={event => setVolume(Number(event.target.value))} />
    </div>}
    <button ref={trigger} type="button" aria-label="배경음악 음량 조절" aria-expanded={expanded}
      aria-controls={expanded ? sliderId : undefined} onClick={() => setExpanded(value => !value)}>
      <Music2 size={18} aria-hidden="true" />
    </button>
  </div>;
}
