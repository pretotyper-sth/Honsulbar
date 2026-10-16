import { appLogin, requestNotificationAgreement } from '@apps-in-toss/web-framework';

const TOKEN_KEY = 'honsulbar:session:v1';
const DEV_KEY = 'honsulbar:dev-user:v1';
const WEB_PREVIEW_KEY = 'honsulbar:web-preview:v1';
const localHost = /(^localhost$|^127\.0\.0\.1$|^192\.168\.|vercel\.app$)/.test(location.hostname);
export const API_BASE = import.meta.env.VITE_API_BASE ?? (localHost ? '' : 'https://honsulbar-app.vercel.app');
export const assetUrl = path => (typeof path === 'string' && path.startsWith('/api/') ? API_BASE + path : path);
export const insideToss = () => typeof window !== 'undefined' && !!window.ReactNativeWebView;

function markTossChrome() {
  if (typeof document !== 'undefined' && insideToss()) document.documentElement.classList.add('in-toss');
}
markTossChrome();
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', markTossChrome);
  window.addEventListener('load', markTossChrome);
}

function webPreviewToken() {
  if (typeof window === 'undefined') return '';
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('web');
    if (fromUrl) {
      sessionStorage.setItem(WEB_PREVIEW_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(WEB_PREVIEW_KEY) || '';
  } catch { return ''; }
}

export function requestPushAgreement(templateCode, { onEvent, onError } = {}) {
  if (!insideToss() || !templateCode || typeof requestNotificationAgreement !== 'function') {
    onError?.(new Error('unsupported'));
    return () => {};
  }
  try {
    return requestNotificationAgreement({
      options: { templateCode },
      onEvent: result => onEvent?.(result),
      onError: error => onError?.(error),
    });
  } catch (error) {
    onError?.(error);
    return () => {};
  }
}

let token = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch {}

export class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } }
export const hasSession = () => !!token;
function setToken(value) {
  token = value;
  try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch {}
}
export const clearSession = () => setToken(null);

async function request(body, method = 'POST', {signal} = {}) {
  const photoRequest=body?.action?.startsWith('photo-');
  const controller=photoRequest?new AbortController():null;
  const cancel=()=>controller?.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
  const timer=controller?setTimeout(cancel,body.action==='photo-verify'?50000:20000):null;
  try {
    const response = await fetch(`${API_BASE}/api/service`, {
      method,
      signal:controller?.signal || signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(error => {
      if(controller?.signal.aborted)throw error;
      return {};
    });
    if (response.status === 401 && body?.action !== 'login') setToken(null);
    if (!response.ok) throw new ApiError(data.error || '요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.', response.status);
    return data;
  } catch (error) {
    if(controller?.signal.aborted)throw new ApiError(signal?.aborted?'검사를 중단했어요.':'검사 연결이 지연돼요. 잠시 후 다시 시도해 주세요.',0);
    if(error instanceof ApiError)throw error;
    throw new ApiError('인터넷 연결을 확인해 주세요.', 0);
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}

export const getConfig = () => request(null, 'GET');
export const call = (action, data, extra = {}, options = {}) => request({ action, data, ...extra }, 'POST', options);

export async function login(config) {
  let result;
  if (insideToss()) {
    let authorizationCode, referrer;
    try {
      const granted = await appLogin();
      authorizationCode = granted?.authorizationCode;
      referrer = granted?.referrer;
    } catch (error) {
      const message = String(error?.message || error?.code || '');
      if (/cancel|canceled|CANCELED|USER_DECLINED|거부/i.test(message)) throw new ApiError('로그인을 취소했어요. 다시 시작해 주세요.', 400);
      throw new ApiError('로그인을 완료하지 못했어요. 다시 시도해 주세요.', 400);
    }
    if (!authorizationCode) throw new ApiError('로그인 정보를 받아오지 못했어요. 다시 시도해 주세요.', 400);
    result = await request({ action: 'login', authorizationCode, referrer: referrer || 'DEFAULT' });
  } else if (config?.devLogin || webPreviewToken()) {
    let key = null;
    try { key = localStorage.getItem(DEV_KEY); } catch {}
    if (!key) { key = `9${Math.floor(Math.random() * 1e8)}`; try { localStorage.setItem(DEV_KEY, key); } catch {} }
    result = await request({ action: 'dev-login', key, preview: webPreviewToken() || undefined });
  } else throw new ApiError('토스 앱에서 혼술바를 열어 주세요.', 400);
  setToken(result.token);
  return result.state;
}

export async function logout() {
  try { await call('logout'); } catch {}
  setToken(null);
}
