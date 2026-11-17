import { createHmac } from 'node:crypto';
import { AppError } from './platform.js';

function pilotConfig(env) {
  if (env.HB_TOSS_SFU_ENABLED !== '1' || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null;
  const url = /^wss:\/\/[a-z0-9-]+\.livekit\.cloud\/?$/i.test(env.LIVEKIT_URL || '') && env.LIVEKIT_URL;
  const [,region,number] = /^([^:]+):([1-9]\d*)$/.exec(env.HB_TOSS_SFU_PILOT_ROOM || '') || [];
  return url && region ? { url, region, number:Number(number) } : null;
}

export function tossSfuPilot(env=process.env) {
  const config = pilotConfig(env);
  return config && { region:config.region, number:config.number };
}

export function tossSfuSession(member, state, data, { env=process.env, now=Date.now() }={}) {
  const config = pilotConfig(env);
  const visit = state?.visit;
  if (!config) throw new AppError('음성 테스트가 아직 열리지 않았어요.',503);
  if (state.safetyPaused || !state.member?.photoChecked || !visit || visit.away ||
      (visit.seconds === 0 && !visit.soloPaused && !(visit.seat === 11 && !state.seatNeutralClock)) ||
      visit.region !== config.region || visit.number !== config.number) {
    throw new AppError('음성 테스트가 열려 있는 바에 입장해 주세요.',403);
  }
  const partner = state.partners?.[member] || null;
  if (data?.visitId !== visit.id || (data?.partnerId ?? null) !== partner) {
    throw new AppError('바의 대화 상태가 바뀌었어요.',409);
  }
  if (partner && (state.partners[partner] !== member || state.reportedIds?.includes(partner) ||
      !state.guests?.some(guest => guest.id === partner))) {
    throw new AppError('대화 상대를 다시 확인해 주세요.',409);
  }
  const base = 'hb-toss-pilot-' + Buffer.from(config.region).toString('base64url') + '-' + config.number;
  const room = partner ? base + '-private-' + [member,partner].sort().join('-') : base;
  const issued = Math.floor(now/1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    iss:env.LIVEKIT_API_KEY, sub:member, nbf:issued-5, exp:issued+120,
    video:{room,roomJoin:true,canPublish:true,canPublishData:false,canSubscribe:true,canPublishSources:['microphone']},
  };
  const jwt = encode({alg:'HS256',typ:'JWT'}) + '.' + encode(claims);
  const signature = createHmac('sha256',env.LIVEKIT_API_SECRET).update(jwt).digest('base64url');
  return {url:config.url,token:jwt+'.'+signature};
}
