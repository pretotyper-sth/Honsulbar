import {assertTossBundle} from './toss-bundle-policy.js';
try {
 console.log('앱인토스 전용 번들 검사 통과',JSON.stringify(await assertTossBundle(process.argv[2]||'honsulbar.ait')));
} catch(error) {
 console.error(error.message);process.exitCode=1;
}
