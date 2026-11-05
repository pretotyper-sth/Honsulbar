import { AppError } from './platform.js';

export function androidVoiceServers(env = process.env) {
  if (!env.HB_ANDROID_ICE_SERVERS) return [];
  try {
    const servers = JSON.parse(env.HB_ANDROID_ICE_SERVERS);
    if (!Array.isArray(servers) || !servers.length || servers.length > 8) throw Error();
    for (const server of servers) {
      const urls = typeof server?.urls === 'string' ? [server.urls] : server?.urls;
      if (!Array.isArray(urls) || !urls.length || urls.some(url => typeof url !== 'string' || !/^(stun|turn|turns):[^\s]+$/.test(url))) throw Error();
      if (urls.some(url => /^turns?:/.test(url)) && (!server.username || !server.credential)) throw Error();
    }
    // shortcut: dedicated free-test credentials; rotate before expanding access beyond the initial cohort.
    return servers.map(({ urls, username, credential }) => ({ urls, ...(username ? { username, credential } : {}) }));
  } catch {
    throw new AppError('음성 연결 설정을 확인 중이에요. 잠시 후 다시 시도해 주세요.', 503);
  }
}
