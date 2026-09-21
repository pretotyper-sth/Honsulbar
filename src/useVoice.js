import { useCallback, useEffect, useRef, useState } from 'react';

export function useVoice(enabled, onError) {
  const [mic, setMic] = useState(false);
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState(0);
  const resources = useRef(null);
  const generation = useRef(0);
  const acquiring = useRef(false);
  const stop = useCallback(() => {
    generation.current++;
    acquiring.current = false;
    const value = resources.current;
    if (value) {
      cancelAnimationFrame(value.frame);
      value.stream.getTracks().forEach(track => track.stop());
      value.source.disconnect();
      value.context.close().catch(() => {});
      resources.current = null;
    }
    setMic(false); setLevel(0); setPending(false);
  }, []);
  useEffect(() => { if (!enabled) stop(); return stop; }, [enabled, stop]);
  async function toggle() {
    if (resources.current || acquiring.current) { stop(); return; }
    if (!enabled) return;
    if (!navigator.mediaDevices?.getUserMedia) { onError('이 브라우저에서는 마이크를 사용할 수 없어요. HTTPS나 localhost에서 열어주세요.'); return; }
    const token = ++generation.current;
    acquiring.current = true; setPending(true);
    let stream, context;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser(); analyser.fftSize = 1024;
      source.connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      const resource = { stream, context, source, frame: 0 }; resources.current = resource;
      let last = 0;
      const sample = now => {
        if (resources.current !== resource) return;
        if (now - last > 65) {
          analyser.getFloatTimeDomainData(values);
          const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
          setLevel(Math.min(1, Math.max(0, (rms - .012) * 14))); last = now;
        }
        resource.frame = requestAnimationFrame(sample);
      };
      resource.frame = requestAnimationFrame(sample);
      stream.getAudioTracks()[0].onended = stop;
      setMic(true);
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      context?.close().catch(() => {});
      if (token === generation.current) {
        stop();
        onError(error.name === 'NotAllowedError' ? '마이크 권한을 허용하면 이야기할 수 있어요.' : '마이크를 연결하지 못했어요. 연결 상태를 확인해 주세요.');
      }
    } finally {
      if (token === generation.current) { acquiring.current = false; setPending(false); }
    }
  }
  return { mic, pending, level, toggle, stop };
}
