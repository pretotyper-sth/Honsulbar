import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {AITReader} from '@apps-in-toss/ait-format';

// AOS assets remain available to the web/AOS deployment, never to the Toss package.
export function isTossPublicAsset(name) {
 const path=name.replaceAll('\\','/').replace(/^\/+/, '').replace(/^sources\//,'');
 return !path.split('/').some(part=>part.startsWith('.')) && path!=='age-verification.html' && !path.startsWith('legal/android/');
}
export function tossPublicAssets(publicDir) {
 const files=[];
 function visit(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
   const path=join(dir,entry.name);
   if(entry.isDirectory())visit(path);
   else if(entry.isFile()) {
    const name=relative(publicDir,path).replaceAll('\\','/');
    if(isTossPublicAsset(name))files.push({name,source:readFileSync(path)});
   }
  }
 }
 visit(publicDir);
 return files;
}
export function assertTossEntry(name,bytes) {
 const path=name.replace(/^\/+/, '');
 if(!isTossPublicAsset(path))throw new Error(`앱인토스 번들에 AOS 전용 파일이 포함됐습니다: ${name}`);
 if(/\.(?:html?|[cm]?js|json|css|txt|map)$/i.test(path)) {
  const text=Buffer.from(bytes).toString('utf8');
  const forbidden=/portone|iamport|IMP\.request_pay|IMP\.init|requestIdentityVerification|com\.honsulbar\.app|(?:cdn|api)\.iamport\.kr|com\.google\.android\.gms\.ads|pagead2\.googlesyndication\.com|com\.android\.billingclient|@capacitor\//i;
  const hit=forbidden.exec(text);
  if(hit)throw new Error(`앱인토스에서 지원하지 않는 SDK/경로가 포함됐습니다: ${name} (${hit[0]})`);
 }
}
export async function assertTossBundle(file) {
 const reader=AITReader.fromBuffer(readFileSync(file));
 const entries=reader.listEntries();
 if(reader.appName!=='honsulbar'||!entries.some(name=>name==='index.html'||name==='sources/index.html'))throw new Error('올바른 혼술바 웹 번들이 아닙니다.');
 for(const name of entries)await assertTossEntry(name,await reader.readEntry(name));
 return {deploymentId:reader.deploymentId,files:entries.length};
}
