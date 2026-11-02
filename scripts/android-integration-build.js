import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { androidBuildConfig } from './android-build-config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, HB_ANDROID_MODE: 'integration' };
const allowed = new Set(['HB_ANDROID_API_URL','HB_AUTH_PUBLIC_URL','HB_AUTH_PUBLIC_KEY','HB_ANDROID_PUSH_ENABLED']);
const path = new URL('../.env.integration.local', import.meta.url);
if (existsSync(path)) for (const line of readFileSync(path, 'utf8').split('\n')) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (match && allowed.has(match[1]) && !env[match[1]]) env[match[1]] = match[2];
}
const config = androidBuildConfig(env);
const base = JSON.parse(config.define['import.meta.env.VITE_API_BASE']);
const response = await fetch(`${base}/api/service`, { signal: AbortSignal.timeout(15000) });
const status = await response.json();
if (!response.ok || !status.apiReady || !status.androidAuthReady || status.devLogin) {
  throw new Error('실연동 API 준비 확인 실패: HTTPS 공통 API와 Android 인증 활성화가 필요합니다. 모의 APK로 대체하지 않습니다.');
}
if (env.HB_ANDROID_PUSH_ENABLED === '1' && !existsSync(new URL('../android/app/google-services.json', import.meta.url))) {
  throw new Error('Firebase의 Android 공개 설정 파일이 필요합니다. 푸시 성공으로 처리하지 않습니다.');
}
execFileSync('bash', ['scripts/android-local.sh', 'apk'], { cwd: root, env, stdio: 'inherit' });
const output = new URL('../../release-files/', import.meta.url);
mkdirSync(output, { recursive: true });
copyFileSync(new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url), new URL('honsulbar-android-integration.apk', output));
console.log('실연동 APK 저장 완료: release-files/honsulbar-android-integration.apk');
