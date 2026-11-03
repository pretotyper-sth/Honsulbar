import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AppsInTossBundle} from '@apps-in-toss/ait-format';
import {assertTossBundle,assertTossEntry,isTossPublicAsset,tossPublicAssets} from '../scripts/toss-bundle-policy.js';

test('Toss excludes AOS identity and legal assets, but keeps its own legal pages and models',()=>{
 for(const name of ['age-verification.html','legal/android/privacy.html','sources/legal/android/refund.html','.DS_Store'])assert.equal(isTossPublicAsset(name),false,name);
 for(const name of ['index.html','legal/privacy.html','face-screening-v1/model.json','honsulbar-logo.png'])assert.equal(isTossPublicAsset(name),true,name);
});
test('copying Toss assets preserves the original AOS source files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'toss-assets-'));
 try {
  mkdirSync(join(dir,'legal/android'),{recursive:true});
  writeFileSync(join(dir,'age-verification.html'),'PortOne.requestIdentityVerification()');
  writeFileSync(join(dir,'legal/android/privacy.html'),'AOS policy');
  writeFileSync(join(dir,'legal/privacy.html'),'Toss policy');
  assert.deepEqual(tossPublicAssets(dir).map(file=>file.name),['legal/privacy.html']);
  // A separate web/AOS build still sees the unmodified source assets.
  assert.equal(isTossPublicAsset('age-verification.html'),false);
  assert.equal(readFileSync(join(dir,'age-verification.html'),'utf8'),'PortOne.requestIdentityVerification()');
  assert.equal(readFileSync(join(dir,'legal/android/privacy.html'),'utf8'),'AOS policy');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('archive scanning rejects inactive external SDK code and AOS routes, regardless of filename',()=>{
 for(const code of ['https://cdn.portone.io/v2/browser-sdk.js','window.PortOne','IMP.request_pay','com.honsulbar.app://identity/callback','com.android.billingclient','com.google.android.gms.ads']) {
  assert.throws(()=>assertTossEntry('sources/assets/app.js',Buffer.from(code)),/지원하지 않는/);
 }
 assert.throws(()=>assertTossEntry('sources/age-verification.html',Buffer.from('')),/AOS 전용/);
 assert.doesNotThrow(()=>assertTossEntry('sources/assets/app.js',Buffer.from('IAP.createOneTimePurchaseOrder(); appLogin(); requestNotificationAgreement(); loadAppsInTossAdmob();')));
});
test('packed AIT uploads are scanned, not just their source directory',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'toss-archive-'));
 try {
  for(const forbidden of [false,true]) {
   const writer=AppsInTossBundle.writer({appName:'honsulbar'});
   writer.addFile('sources/index.html',new TextEncoder().encode('<main>혼술바</main>'));
   writer.addFile('sources/assets/app.js',new TextEncoder().encode(forbidden?'window.PortOne':'appLogin()'));
   const file=join(dir,'test.ait');writeFileSync(file,await writer.toBuffer());
   if(forbidden)await assert.rejects(assertTossBundle(file),/지원하지 않는/);
   else assert.equal((await assertTossBundle(file)).files,2);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
