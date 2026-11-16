import { createHmac } from 'node:crypto';
import { AppError } from './platform.js';

function sfuUrl(env) {
  if (env.HB_TOSS_SFU_ENABLED !== '1' || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  return /^wss:\/\/[a-z0-9-]+\.livekit\.cloud\/?$/i.test(env.LIVEKIT_URL || '') && env.LIVEKIT_URL;
}

export function tossSfuReady(env=process.env) {
  return Boolean(sfuUrl(env));
}

export function tossSfuPilot(env=process.env) {
  const [,region,number] = /^([^:]+):([1-9]\d*)$/.exec(env.HB_TOSS_SFU_PILOT_ROOM || '') || [];
  return tossSfuReady(env) && region ? { region, number:Number(number) } : null;
}

export function tossSfuSession(member, state, data, { env=process.env, now=Date.now() }={}) {
  const url = sfuUrl(env);
  const visit = state?.visit;
  if (!url) throw new AppError('음성 연결을 준비 중이에요.',503);
  if (state.safetyPaused || !state.member?.photoChecked || !visit || visit.away ||
      (visit.seconds === 0 && !visit.soloPaused && !(visit.seat === 11 && !state.seatNeutralClock))) {
    throw new AppError('바에 입장한 뒤 음성을 연결해 주세요.',403);
  }
  const partner = state.partners?.[member] || null;
  if (data?.visitId !== visit.id || (data?.partnerId ?? null) !== partner) {
    throw new AppError('바의 대화 상태가 바뀌었어요.',409);
  }
  if (partner && (state.partners[partner] !== member || state.reportedIds?.includes(partner) ||
      !state.guests?.some(guest => guest.id === partner))) {
    throw new AppError('대화 상대를 다시 확인해 주세요.',409);
  }
  const base = 'hb-toss-pilot-' + Buffer.from(visit.region).toString('base64url') + '-' + visit.number;
  const room = partner ? base + '-private-' + [member,partner].sort().join('-') : base;
  const issued = Math.floor(now/1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    iss:env.LIVEKIT_API_KEY, sub:member, nbf:issued-5, exp:issued+120,
    video:{room,roomJoin:true,canPublish:true,canPublishData:false,canSubscribe:true,canPublishSources:['microphone']},
  };
  const jwt = encode({alg:'HS256',typ:'JWT'}) + '.' + encode(claims);
  const signature = createHmac('sha256',env.LIVEKIT_API_SECRET).update(jwt).digest('base64url');
  return {url,token:jwt+'.'+signature};
}
