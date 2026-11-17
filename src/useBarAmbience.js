import { useCallback, useEffect, useRef } from 'react';
import { shuffleBarMusic } from './bar-music';
import { normalizeBarMusic } from './bar-music-level';

export function useBarAmbience({ active, soundOn, prepareAudio, level=1, tracks }) {
  const music = useRef(null);
  const playlistKey = tracks?.join(',');
  const volume = active && soundOn ? level * 0.01518 : 0;
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
        let output = normalizeBarMusic(context, element, latestVolume.current);
        if (!output) {
          const source = context.createMediaElementSource(element);
          const gain = context.createGain();
          gain.gain.value = latestVolume.current;
          source.connect(gain);
          gain.connect(context.destination);
          output = {
            setVolume: (value, transition) => gain.gain.setTargetAtTime(value, context.currentTime, transition),
            close: () => { source.disconnect(); gain.disconnect(); },
          };
        }
        const item = { element, output };
        let queue = [], previousTrack;
        const selectNext = () => {
          if (!queue.length) queue = shuffleBarMusic(previousTrack, playlistKey?.split(','));
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
  }, [play, prepareAudio, playlistKey]);

  const pause = useCallback(() => music.current?.element.pause(), []);

  useEffect(() => () => {
    const item = music.current;
    if (!item) return;
    item.element.onended = null;
    item.element.pause();
    item.element.removeAttribute('src');
    item.element.load();
    item.output.close();
    music.current = null;
  }, [playlistKey]);

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
    if (item) item.output.setVolume(volume, 0.32);
  }, [volume]);

  return { start, pause };
}
