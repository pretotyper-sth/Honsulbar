import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const capacitorPath = new URL('../capacitor.config.json', import.meta.url);
const original = readFileSync(capacitorPath, 'utf8');
const config = JSON.parse(original);
config.android.allowMixedContent = false;
try {
  writeFileSync(capacitorPath, JSON.stringify(config, null, 2) + '\n');
  execFileSync('bash', ['scripts/android-local.sh', 'apk'], {
    cwd: root,
    env: { ...process.env, HB_ANDROID_MODE: 'local', HB_ANDROID_FLOW_MOCK: '1', HB_SOCIAL_LOGIN_ENABLED: '0', HB_ANDROID_PUSH_ENABLED: '0' },
    stdio: 'inherit',
  });
  const output = new URL('../../release-files/aos-flow-test/', import.meta.url);
  mkdirSync(output, { recursive: true });
  copyFileSync(new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url), new URL('honsulbar-flow-test.apk', output));
  console.log('모의 기기 테스트 APK: release-files/aos-flow-test/honsulbar-flow-test.apk');
} finally {
  writeFileSync(capacitorPath, original);
}
