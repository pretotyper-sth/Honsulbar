import { AppError } from './platform.js';
import { parseVoiceServers } from './android-voice.js';

const TTL_SECONDS = 4 * 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const cached = new Map();

function staticRelay(value) {
  // Metered's dashboard can copy a JavaScript snippet instead of JSON. Parse data only.
  const config = value.trim()
    .replace(/^(?:(?:var|const|let)\s+\w+\s*=\s*)?new\s+RTCPeerConnection\(\s*([\s\S]+)\s*\)\s*;?$/, '$1')
    .replace(/"(?:[^"\\]|\\.)*"|\b(?:iceServers|urls|username|credential)(?=\s*:)|,(?=\s*[}\]])/g, token => {
      if (token[0] === '"') return token;
      return token === ',' ? '' : JSON.stringify(token);
    });
  const iceServers = parseVoiceServers(config);
  if (!iceServers.some(({urls}) => [urls].flat().some(url => /^turns?:/.test(url)))) {
    throw new AppError('음성 중계에 연결하지 못했어요.',503);
  }
  return iceServers;
}

export function tossVoiceRelayReady(env = process.env) {
  try {
    return env.HB_TOSS_ICE_SERVERS ? staticRelay(env.HB_TOSS_ICE_SERVERS).length > 0
      : Boolean(env.HB_TOSS_TURN_KEY_ID && env.HB_TOSS_TURN_API_TOKEN);
  } catch {
    return false;
  }
}

export async function tossVoiceIce(member, { env = process.env, fetcher = fetch, now = Date.now() } = {}) {
  const expiresAt = now + TTL_SECONDS * 1000;
  if (env.HB_TOSS_ICE_SERVERS) {
    // shortcut: one credential under Metered's test quota; rotate before opening to a larger cohort.
    return {iceServers:staticRelay(env.HB_TOSS_ICE_SERVERS),expiresAt};
  }
  const keyId = env.HB_TOSS_TURN_KEY_ID;
  const token = env.HB_TOSS_TURN_API_TOKEN;
  if (!keyId || !token) return { iceServers: [] };

  const existing = cached.get(member);
  if (existing?.validUntil > now) return existing.request;

  const request = (async () => {
    let response;
    try {
      response = await fetcher(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ttl:TTL_SECONDS}),
        signal:AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const iceServers = data.iceServers.map(({urls, username, credential}) => ({
        urls:(Array.isArray(urls) ? urls : [urls]).filter(url => /^(?:stun|turns?):/.test(url) && !/:53(?:\?|$)/.test(url)),
        ...(username && credential ? {username,credential} : {}),
      })).filter(server => server.urls.length);
      if (!iceServers.some(server => server.credential && server.urls.some(url => /^turns?:/.test(url)))) throw new Error();
      return {iceServers,expiresAt};
    } catch {
      throw new AppError('음성 중계에 연결하지 못했어요.',503);
    }
  })();
  if (cached.size >= 256) cached.delete(cached.keys().next().value);
  cached.set(member,{request,validUntil:expiresAt - REFRESH_MARGIN_MS});
  try { return await request; }
  catch (error) {
    if (cached.get(member)?.request === request) cached.delete(member);
    throw error;
  }
}
