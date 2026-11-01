import { fileURLToPath } from 'node:url';

function httpsOrigin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name}: HTTPS 주소가 필요합니다.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${name}: 인증정보나 경로 없는 HTTPS 주소만 사용하세요.`);
  }
  return url.origin;
}

export function androidBuildConfig(env = process.env) {
  const mode = env.HB_ANDROID_MODE || 'local';
  if (!['local', 'integration'].includes(mode)) throw new Error('HB_ANDROID_MODE: local 또는 integration을 사용하세요.');
  const integration = mode === 'integration';
  const api = integration ? httpsOrigin(env.HB_ANDROID_API_URL, 'HB_ANDROID_API_URL') : 'http://localhost:3001';
  const social = integration || env.HB_SOCIAL_LOGIN_ENABLED === '1';
  const auth = social ? httpsOrigin(env.HB_AUTH_PUBLIC_URL, 'HB_AUTH_PUBLIC_URL') : '';
  const key = social ? env.HB_AUTH_PUBLIC_KEY || '' : '';
  if (social && !key) throw new Error('HB_AUTH_PUBLIC_KEY: 공개 Auth 키가 필요합니다.');
  if (/^sb_secret_/.test(key)) throw new Error('Auth 서버 비밀키는 앱에 넣을 수 없습니다.');
  if (key.split('.').length === 3) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); }
    catch { throw new Error('Auth 공개 키 형식을 확인하세요.'); }
    if (payload.role !== 'anon') throw new Error('앱에는 anon 역할의 공개 키만 허용합니다.');
  }
  return {
    envDir: '.android-test-env-unused',
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(api),
      'import.meta.env.VITE_ANDROID_TEST': JSON.stringify(!integration),
      'import.meta.env.VITE_SOCIAL_LOGIN_ENABLED': JSON.stringify(social),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(auth),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
    },
    resolve: { alias: { '@apps-in-toss/web-framework': fileURLToPath(new URL('../src/android-test-platform.js', import.meta.url)) } },
    build: { outDir: 'dist-android' },
  };
}
