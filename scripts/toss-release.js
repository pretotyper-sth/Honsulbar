import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function loadEnv(name) {
  const file = resolve(root, name);
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv('.env.local');
loadEnv('.env');
const ait = resolve(root, 'node_modules/.bin/ait');
const vite = resolve(root, 'node_modules/.bin/vite');
const bundle = resolve(root, 'honsulbar.ait');
const args = new Set(process.argv.slice(2));
const buildOnly = args.has('--build-only');
const uploadOnly = args.has('--upload-only');
const requireUpload = args.has('--require-upload') || process.env.AIT_REQUIRE_UPLOAD === '1';
const skipUpload = buildOnly || process.env.AIT_AUTO_DEPLOY === '0';

function run(bin, argv) {
  const result = spawnSync(bin, argv, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status) process.exit(result.status);
}

function capture(bin, argv) {
  return spawnSync(bin, argv, { cwd: root, encoding: 'utf8', env: process.env });
}

function memo() {
  const fromEnv = (process.env.AIT_DEPLOY_MEMO || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  if (fromEnv) return fromEnv.slice(0, 120);
  const git = capture('git', ['log', '-1', '--format=%h %s']);
  const subject = (git.status === 0 ? git.stdout.trim() : '번들 업로드').slice(0, 80);
  const when = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(',', '');
  return `${when} KST · ${subject}`.slice(0, 120);
}

function apiKey() {
  return process.env.AIT_API_KEY || process.env.TOSS_AIT_API_KEY || '';
}

if (!existsSync(ait)) {
  console.error('ait CLI가 없습니다. npm install 후 다시 실행해 주세요.');
  process.exit(1);
}

if (!uploadOnly) {
  if (!existsSync(vite)) {
    console.error('vite가 없습니다. npm install 후 다시 실행해 주세요.');
    process.exit(1);
  }
  console.log('웹 번들을 빌드합니다.');
  run(vite, ['build']);
  console.log('앱인토스 번들을 빌드합니다.');
  run(ait, ['build']);
}

if (skipUpload) process.exit(0);
if (!existsSync(bundle)) {
  console.error('honsulbar.ait가 없습니다. 먼저 번들을 빌드해 주세요.');
  process.exit(1);
}

const key = apiKey();
const note = memo();
const deploy = ['deploy', '--location', bundle, '-m', note, '--timeout', '180'];
if (key) deploy.push('--api-key', key);
if (process.env.AIT_PROFILE) deploy.push('--profile', process.env.AIT_PROFILE);

console.log(`번들을 업로드합니다.\n메모: ${note}`);
const uploaded = capture(ait, deploy);
if (uploaded.stdout) process.stdout.write(uploaded.stdout);
if (uploaded.stderr) process.stderr.write(uploaded.stderr);
if (uploaded.status === 0) process.exit(0);

console.error(`
업로드에 실패했어요. 콘솔에서 API 키를 한 번만 발급하면 다음부터 자동으로 올라갑니다.

1. 앱인토스 콘솔 → 워크스페이스 → 왼쪽 메뉴 '키'
2. API 키 발급. 앱 권한은 honsulbar 또는 전체 앱
3. 로컬은 .env.local에 AIT_API_KEY=발급키
   GitHub는 Settings → Secrets → AIT_API_KEY
   이 기기에만 쓰려면: npx ait token add default 발급키
`);
process.exit(requireUpload ? uploaded.status || 1 : 0);
