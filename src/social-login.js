import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';

const callback = 'com.honsulbar.localtest://auth/callback';
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export function validateCallback(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'com.honsulbar.localtest:' && parsed.hostname === 'auth' && parsed.pathname === '/callback'; }
  catch { return false; }
}
export async function socialLogin(provider, config = import.meta.env, {browser = Browser, app = App, fetcher = fetch} = {}) {
  const base = config.VITE_SUPABASE_URL;
  const key = config.VITE_SUPABASE_ANON_KEY;
  if (!['google','kakao'].includes(provider) || !base?.startsWith('https://') || !key) throw new Error('로그인 설정을 준비 중이에요.');
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  let handle, closeHandle, timer;
  try {
    return await new Promise(async (resolve, reject) => {
      let finishing = false;
      const finish = async url => {
        if (!validateCallback(url) || finishing) return;
        finishing = true;
        try {
          const params = new URL(url).searchParams;
          const code = params.get('code');
          if (!code || params.has('error')) throw new Error('로그인을 완료하지 못했어요.');
          const response = await fetcher(`${base}/auth/v1/token?grant_type=pkce`, { method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({auth_code:code,code_verifier:verifier}),signal:AbortSignal.timeout(15000) });
          const data = await response.json();
          if (!response.ok || !data.access_token) throw new Error('다시 로그인해 주세요.');
          resolve(data.access_token);
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
  } finally { clearTimeout(timer); await handle?.remove(); await closeHandle?.remove(); await browser.close().catch(()=>{}); }
}
