import { useCallback, useEffect, useRef } from 'react';
import { shuffleBarMusic } from './bar-music';

export function useBarAmbience({ active, soundOn, talking, prepareAudio, level=1 }) {
  const music = useRef(null);
  const volume = active && soundOn ? level * (talking ? 0.0015 : 0.012) : 0;
  const latestVolume = useRef(volume);
  latestVolume.current = volume;

  const play = useCallback(item => {
    if (item.element.paused && !item.starting) {
      item.starting = true;
      item.element.play().catch(() => {}).finally(() => { item.starting = false; });
    }
  }, []);

  const start = useCallback(() => {
    if (!latestVolume.current || document.hidden) return;
    const context = prepareAudio();
    if (!context) return;
    if (!music.current) {
      if (!context.createMediaElementSource) return;
      const element = new Audio();
      try {
        const source = context.createMediaElementSource(element);
        const gain = context.createGain();
        gain.gain.value = latestVolume.current;
        source.connect(gain);
        gain.connect(context.destination);
        const item = { element, source, gain, context };
        let queue = [], previousTrack;
        const selectNext = () => {
          if (!queue.length) queue = shuffleBarMusic(previousTrack);
          previousTrack = queue.shift();
          element.src = `${import.meta.env.BASE_URL}audio/lounge/${previousTrack.file}.m4a`;
        };
        element.onended = () => {
          selectNext();
          if (latestVolume.current && !document.hidden) play(item);
        };
        selectNext();
        music.current = item;
      } catch {
        return;
      }
    }
    play(music.current);
  }, [play, prepareAudio]);

  const pause = useCallback(() => music.current?.element.pause(), []);

  useEffect(() => {
    const syncPlayback = () => {
      if (active && soundOn && !document.hidden) start();
      else pause();
    };
    syncPlayback();
    document.addEventListener('visibilitychange', syncPlayback);
    return () => document.removeEventListener('visibilitychange', syncPlayback);
  }, [active, soundOn, start, pause]);

  useEffect(() => {
    const item = music.current;
    if (item) item.gain.gain.setTargetAtTime(volume, item.context.currentTime, talking ? 0.08 : 0.32);
  }, [volume, talking]);

  useEffect(() => () => {
    const item = music.current;
    if (!item) return;
    item.element.onended = null;
    item.element.pause();
    item.element.removeAttribute('src');
    item.element.load();
    item.source.disconnect();
    item.gain.disconnect();
    music.current = null;
  }, []);

  return { start, pause };
}
