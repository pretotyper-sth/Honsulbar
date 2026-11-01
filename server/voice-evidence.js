import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { AppError } from './platform.js';

export const VOICE_CONSENT_VERSION = '2026-10-24';
export function voiceEvidenceReady() { return process.env.HB_VOICE_EVIDENCE_ENABLED === '1' && /^[a-f0-9]{64}$/i.test(process.env.HB_VOICE_EVIDENCE_KEY || ''); }
export function validateVoiceEvidence(value) {
  if (!value || value.consentVersion !== VOICE_CONSENT_VERSION || typeof value.audio !== 'string' || value.audio.length > 854000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio)) throw new AppError('음성 증거 형식을 확인해 주세요.');
  const audio = Buffer.from(value.audio, 'base64');
  if (audio.length < 32044 || audio.length > 640044 || audio.toString('ascii',0,4) !== 'RIFF' || audio.toString('ascii',8,12) !== 'WAVE' || audio.toString('ascii',12,16) !== 'fmt ' || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000 || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16 || audio.toString('ascii',36,40) !== 'data' || audio.readUInt32LE(40) !== audio.length - 44 || audio.readUInt32LE(4) !== audio.length - 8 || (audio.length - 44) % 2) throw new AppError('20초 이내의 신고 음성만 제출할 수 있어요.');
  return audio;
}
export function encryptEvidence(audio) {
  if (!voiceEvidenceReady()) throw new AppError('음성 증거 보관 설정을 준비 중이에요.',503);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.HB_VOICE_EVIDENCE_KEY,'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(audio),cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), digest: createHash('sha256').update(audio).digest('hex') };
}
export function decryptEvidence(row) {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(process.env.HB_VOICE_EVIDENCE_KEY,'hex'), Buffer.from(row.iv,'base64'));
  decipher.setAuthTag(Buffer.from(row.tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.ciphertext,'base64')),decipher.final()]);
}
