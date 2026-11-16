const TARGET_RMS = 0.1;
const SILENCE_RMS = 0.006;
const MAX_GAIN = 3;
const MIN_GAIN = 0.25;

export function musicGain(samples) {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const rms = Math.sqrt(energy / samples.length);
  if (!(rms >= SILENCE_RMS)) return 1;
  return Math.max(MIN_GAIN, Math.min(MAX_GAIN, TARGET_RMS / rms));
}

export function normalizeBarMusic(context, player, volume) {
  if (!context.createAnalyser || !context.createDynamicsCompressor) return null;
  const meter = context.createAnalyser();
  if (typeof meter.getFloatTimeDomainData !== 'function') return null;
  meter.fftSize = 4096;
  const level = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 6;
  compressor.ratio.value = 16;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.2;
  const output = context.createGain();
  output.gain.value = volume;

  const source = context.createMediaElementSource(player);
  source.connect(meter);
  meter.connect(level);
  level.connect(compressor);
  compressor.connect(output);
  output.connect(context.destination);
  player.volume = 1;

  const samples = new Float32Array(meter.fftSize);
  const measure = () => {
    if (player.paused || context.state !== 'running') return;
    meter.getFloatTimeDomainData(samples);
    const gain = musicGain(samples);
    const now = context.currentTime;
    const parameter = level.gain;
    const previous = parameter.value;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(previous, now);
    parameter.setTargetAtTime(gain, now, gain < previous ? 0.12 : 1.6);
  };
  let timer;
  const start = () => { timer ??= setInterval(measure, 100); };
  const stop = () => { clearInterval(timer); timer = undefined; };
  player.addEventListener('playing', start);
  player.addEventListener('pause', stop);
  player.addEventListener('ended', stop);

  return {
    setVolume(value, transition) {
      output.gain.setTargetAtTime(value, context.currentTime, transition);
    },
    close() {
      stop();
      player.removeEventListener('playing', start);
      player.removeEventListener('pause', stop);
      player.removeEventListener('ended', stop);
      for (const node of [source, meter, level, compressor, output]) node.disconnect();
    },
  };
}
