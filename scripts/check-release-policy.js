import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const release = process.argv.includes('--release') || process.env.VERCEL_ENV === 'production';
if (release) {
  if(process.env.HB_LOCAL_DB==='1'||process.env.HB_DEV_LOGIN==='1'){
    console.error('운영 배포에서는 HB_LOCAL_DB와 HB_DEV_LOGIN을 꺼 주세요. 로컬 테스트 데이터는 배포 대상이 아닙니다.');
    process.exit(1);
  }
  const files = ['docs/honsulbar-monitoring-response-policy.md', 'public/legal/monitoring.html'];
  for (const file of files) {
    const text = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    if (/배포 전 검토용 초안|정식 배포 시 확정/.test(text)) {
      console.error(`배포 정책이 초안입니다: ${file}. 정식 버전·시행일을 확정하고 HTML·PDF를 갱신해 주세요.`);
      process.exit(1);
    }
  }
}
