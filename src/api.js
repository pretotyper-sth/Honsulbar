import {openAgeTest,pendingAgeTest,clearAgeTest,ageCallbackId} from './age-verification';
import { socialLogin, resumeSocialLogin } from './social-login';
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
export const clearSession = () => { setToken(null); pendingAgeTest(''); };

const flowMockTransport = import.meta.env.VITE_FLOW_MOCK ? async (body, method) => {
  const { flowMockRequest } = await import('./flow-mock-api.js');
  return flowMockRequest(body, method);
} : null;

async function request(body, method = 'POST', {signal} = {}) {
  if (typeof flowMockTransport === 'function') return flowMockTransport(body, method);
  const requestToken = token;
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
      headers: { 'Content-Type': 'application/json', ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(error => {
      if(controller?.signal.aborted)throw error;
      return {};
    });
    // A response from the previous account must never clear or replace the current session.
    if (token !== requestToken) throw new ApiError('로그인 상태가 바뀌었어요. 다시 시도해 주세요.', 409);
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

export async function login(config, provider, accountTransferCode) {
  const startingToken = token;
  let result;
  if (provider) {
    const proof = await socialLogin(provider,import.meta.env,{purpose:accountTransferCode?'transfer':'login',accountTransferCode});
    if (token !== startingToken) throw new ApiError('로그인 상태가 바뀌었어요. 다시 시도해 주세요.', 409);
    result = await request({action:'social-login',provider,...proof,...(accountTransferCode?{accountTransferCode}:{})});
  } else if (insideToss()) {
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
  } else if (import.meta.env.VITE_ANDROID_TEST && (config?.devLogin || webPreviewToken())) {
    let key = null;
    try { key = localStorage.getItem(DEV_KEY); } catch {}
    if (!key) { key = `9${Math.floor(Math.random() * 1e8)}`; try { localStorage.setItem(DEV_KEY, key); } catch {} }
    result = await request({ action: 'dev-login', key, preview: webPreviewToken() || undefined });
  } else throw new ApiError('토스 앱에서 혼술바를 열어 주세요.', 400);
  setToken(result.token);
  return result.state;
}

export async function playReviewLogin(email,password) {
  const startingToken=token;
  const base=import.meta.env.VITE_SUPABASE_URL;
  if(!base?.startsWith('https://')||!import.meta.env.VITE_SUPABASE_ANON_KEY)throw new ApiError('Review access is unavailable.',503);
  let response;
  try { response=await fetch(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:import.meta.env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(15000)}); }
  catch {throw new ApiError('Please try again later.',503);}
  const proof=await response.json().catch(()=>null);
  if(!response.ok||!proof?.access_token)throw new ApiError('Check your review credentials.',401);
  if(token!==startingToken)throw new ApiError('Please sign in again.',409);
  const result=await request({action:'play-review-login',accessToken:proof.access_token});
  setToken(result.token);
  return result.state;
}

export async function logout() {
  const startingToken = token;
  try { await call('logout'); } catch {}
  if (token === startingToken) setToken(null);
}

export async function createSocialAccountTransfer(provider) {
  const tag=await sessionTag(token);
  const proof=await socialLogin(provider,import.meta.env,{purpose:'transfer-source',sessionTag:tag});
  if(!token||tag!==await sessionTag(token))throw new ApiError('다시 로그인해 주세요.',401);
  return (await request({action:'account-transfer-create',provider,...proof})).result;
}
export async function linkSocialAccount(provider) {
  const startingToken = token;
  if (!startingToken) throw new ApiError('계정을 연결하려면 다시 로그인해 주세요.', 401);
  const proof = await socialLogin(provider, import.meta.env, {purpose:'link',sessionTag:await sessionTag(startingToken)});
  if (token !== startingToken) throw new ApiError('로그인 상태가 바뀌었어요. 다시 시도해 주세요.', 409);
  return request({action:'link-social',provider,...proof});
}

async function sessionTag(value) {
  if (!value) return '';
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function resumeLogin() {
  if (!import.meta.env.VITE_SOCIAL_LOGIN_ENABLED) return null;
  const pending = await resumeSocialLogin();
  if (!pending) return null;
  if(pending.purpose==='transfer-source'){
    if(!token||pending.sessionTag!==await sessionTag(token))throw new ApiError('다시 로그인해 주세요.',401);
    const {result}=await request({action:'account-transfer-create',provider:pending.provider,accessToken:pending.accessToken,providerToken:pending.providerToken});
    return {state:(await request({action:'state'})).state,accountTransfer:result};
  }
  if (pending.purpose === 'link') {
    if (!token || pending.sessionTag !== await sessionTag(token)) throw new ApiError('계정을 연결하려면 다시 로그인해 주세요.', 401);
    await request({action:'link-social',provider:pending.provider,accessToken:pending.accessToken,providerToken:pending.providerToken});
    return {state:(await request({action:'state'})).state,linked:true};
  }
  const result = await request({action:'social-login',provider:pending.provider,accessToken:pending.accessToken,providerToken:pending.providerToken,...(pending.purpose==='transfer'?{accountTransferCode:pending.accountTransferCode}:{})});
  setToken(result.token);
  return {state:result.state,linked:false};
}

export async function beginAgeVerification(){
 const {result}=await request({action:"age-test-start"});
 await openAgeTest(result,await sessionTag(token),API_BASE);
}
let ageCompleting;
export async function finishAgeVerification(url){
 if(ageCompleting)return ageCompleting;
 const pending=pendingAgeTest(await sessionTag(token));
 if(!pending||(url&&ageCallbackId(url)!==pending.id))throw new ApiError("앱에서 인증을 다시 시작해 주세요.",400);
 ageCompleting=(async()=>{const {result}=await request({action:"age-test-complete",data:{id:pending.id}});if(result?.verified)clearAgeTest(pending.id);return result;})();
 try{return await ageCompleting;}finally{ageCompleting=null;}
}
