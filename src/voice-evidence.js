// A per-peer memory buffer. Never records the microphone or writes browser storage.
export const VOICE_CONSENT_VERSION = '2026-10-24';
export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 20;

export function createVoiceBuffer(rate = SAMPLE_RATE) {
  const samples = new Int16Array(rate * MAX_SECONDS);
  let position = 0, length = 0;
  return {
    append(input, inputRate) {
      const count = Math.floor(input.length * rate / inputRate);
      for (let i = 0; i < count; i++) {
        const value = Math.max(-1, Math.min(1, input[Math.floor(i * inputRate / rate)]));
        samples[position] = Math.round(value * (value < 0 ? 32768 : 32767));
        position = (position + 1) % samples.length;
        length = Math.min(length + 1, samples.length);
      }
    },
    clear() { samples.fill(0); position = 0; length = 0; },
    wav() {
      if (!length) return null;
      const bytes = new ArrayBuffer(44 + length * 2), view = new DataView(bytes);
      const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, length * 2, true);
      for (let i = 0; i < length; i++) view.setInt16(44 + i * 2, samples[(position - length + samples.length + i) % samples.length], true);
      return { bytes: new Uint8Array(bytes), seconds: length / rate };
    },
  };
}

export function evidencePayload(buffer) {
  const audio = buffer?.wav();
  if (!audio || audio.seconds < 1) return null;
  let binary = '';
  for (let offset = 0; offset < audio.bytes.length; offset += 8192) binary += String.fromCharCode(...audio.bytes.subarray(offset, offset + 8192));
  return { audio: btoa(binary), seconds: audio.seconds, consentVersion: VOICE_CONSENT_VERSION };
}
