import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

const callback = 'com.honsulbar.app://auth/callback';
const pendingKey = 'honsulbar:pending-oauth:v1';
const localStore = () => { try { return globalThis.localStorage; } catch { return null; } };
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function validateCallback(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'com.honsulbar.app:' && parsed.hostname === 'auth' && parsed.pathname === '/callback' && !parsed.username && !parsed.password && !parsed.port && !parsed.hash; }
  catch { return false; }
}
function removePending(storage, verifier) {
  try { if (JSON.parse(storage?.getItem(pendingKey) || 'null')?.verifier === verifier) storage.removeItem(pendingKey); } catch {}
}
async function exchange(url, pending, config, fetcher) {
  const params = new URL(url).searchParams;
  const codes = params.getAll('code');
  if (codes.length !== 1 || !codes[0] || params.has('error')) throw new Error('로그인을 완료하지 못했어요.');
  const response = await fetcher(`${config.VITE_SUPABASE_URL}/auth/v1/token?grant_type=pkce`, { method:'POST',headers:{apikey:config.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({auth_code:codes[0],code_verifier:pending.verifier}),signal:AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok || !data.access_token || !data.provider_token) throw new Error('다시 로그인해 주세요.');
  return {accessToken:data.access_token,providerToken:data.provider_token};
}
export async function resumeSocialLogin(config = import.meta.env, {app = App, fetcher = fetch, storage = localStore(), now = Date.now()} = {}) {
  let pending;
  try { pending = JSON.parse(storage?.getItem(pendingKey) || 'null'); } catch { return null; }
  if (!pending) return null;
  if (!['google','kakao'].includes(pending.provider) || !/^[A-Za-z0-9_-]{43}$/.test(pending.verifier || '') || !Number.isFinite(pending.createdAt) || now < pending.createdAt || now - pending.createdAt > 120000 || !['login','link','transfer','transfer-source'].includes(pending.purpose) || (pending.purpose==='transfer-source'&&!/^[a-f0-9]{64}$/.test(pending.sessionTag||'')) || (pending.purpose==='transfer'&&!/^[A-Za-z0-9_-]{22}$/.test(pending.accountTransferCode||''))) {
    storage?.removeItem(pendingKey); return null;
  }
  const launch = await app.getLaunchUrl?.().catch(() => null);
  if (!launch?.url || !validateCallback(launch.url)) return null;
  if (!config.VITE_SUPABASE_URL?.startsWith('https://') || !config.VITE_SUPABASE_ANON_KEY) throw new Error('로그인 설정을 준비 중이에요.');
  removePending(storage, pending.verifier);
  return { provider: pending.provider, purpose: pending.purpose, sessionTag: pending.sessionTag, accountTransferCode:pending.accountTransferCode, ...await exchange(launch.url, pending, config, fetcher) };
}
export async function socialLogin(provider, config = import.meta.env, {browser = Browser, app = App, fetcher = fetch, storage = localStore(), purpose = 'login', sessionTag, accountTransferCode} = {}) {
  const base = config.VITE_SUPABASE_URL;
  const key = config.VITE_SUPABASE_ANON_KEY;
  if (!['google','kakao'].includes(provider) || !base?.startsWith('https://') || !key) throw new Error('로그인 설정을 준비 중이에요.');
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const pending = {verifier, provider, createdAt:Date.now(), purpose, sessionTag, accountTransferCode};
  try { storage?.setItem(pendingKey, JSON.stringify(pending)); } catch {}
  const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  let handle, closeHandle, timer;
  try {
    return await new Promise(async (resolve, reject) => {
      let finishing = false;
      const finish = async url => {
        if (!validateCallback(url) || finishing) return;
        finishing = true;
        clearTimeout(timer);
        try {
          resolve(await exchange(url, pending, config, fetcher));
        } catch (error) { reject(error); }
      };
      try {
        handle = await app.addListener('appUrlOpen', event => finish(event.url));
        closeHandle = await browser.addListener('browserFinished', () => {
          if (finishing) return;
          finishing = true;
          reject(new Error('로그인을 취소했어요.'));
        });
        timer = setTimeout(() => { finishing = true; reject(new Error('로그인 시간이 지났어요. 다시 시도해 주세요.')); },120000);
        const url = new URL(`${base}/auth/v1/authorize`);
        url.search = new URLSearchParams({provider,redirect_to:callback,code_challenge:challenge,code_challenge_method:'s256'}).toString();
        await browser.open({url:url.toString()});
      } catch(error) { reject(error); }
    });
  } finally { removePending(storage, verifier); clearTimeout(timer); await handle?.remove(); await closeHandle?.remove(); await browser.close().catch(()=>{}); }
}
