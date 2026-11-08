import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppError } from './platform.js';

export const FULL_VOICE_VERSION = '2026-11-08-full';
export function fullVoiceReady() {
  return process.env.HB_FULL_VOICE_ENABLED === '1' && /^[a-f0-9]{64}$/i.test(process.env.HB_VOICE_EVIDENCE_KEY || '');
}
export function encryptRecording(value) {
  if (!fullVoiceReady()) throw new AppError('음성 안전 보관 설정을 준비 중이에요.', 503);
  if (!['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].includes(value?.mime) ||
    typeof value.audio !== 'string' || value.audio.length>262144 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio)) {
    throw new AppError('녹음 형식을 확인해 주세요.');
  }
  const bytes=Buffer.from(value.audio,'base64');
  const valid=value.mime.startsWith('audio/webm') ? bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) :
    value.mime.startsWith('audio/ogg') ? bytes.toString('ascii',0,4)==='OggS' : bytes.toString('ascii',4,8)==='ftyp';
  if (!valid || bytes.length<16 || bytes.length>196608) throw new AppError('녹음 파일을 확인해 주세요.');
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.HB_VOICE_EVIDENCE_KEY,'hex'),iv);
  const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),digest:createHash('sha256').update(bytes).digest('hex')};
}
export function decryptRecording(row) {
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.HB_VOICE_EVIDENCE_KEY,'hex'),Buffer.from(row.iv,'base64'));
  cipher.setAuthTag(Buffer.from(row.tag,'base64'));
  return Buffer.concat([cipher.update(Buffer.from(row.ciphertext,'base64')),cipher.final()]).toString('base64');
}
