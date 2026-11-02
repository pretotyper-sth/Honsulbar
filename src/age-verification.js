import { Browser } from '@capacitor/browser';
const key='honsulbar:pending-age-test:v1';
const store=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function ageCallbackId(value){
 try{const u=new URL(value);const ids=u.searchParams.getAll('id');return u.protocol==='com.honsulbar.app:'&&u.hostname==='identity'&&u.pathname==='/callback'&&!u.username&&!u.password&&!u.port&&!u.hash&&ids.length===1?ids[0]:null;}catch{return null;}
}
export function pendingAgeTest(sessionTag,{storage=store(),now=Date.now()}={}){
 try{const value=JSON.parse(storage?.getItem(key)||'null');if(value?.sessionTag===sessionTag&&sessionTag&&value.expires>now&&value.expires<=now+600000&&/^ha-\d{10}-[a-f0-9]{16}-[a-f0-9]{32}$/.test(value.id))return value;}catch{}
 try{storage?.removeItem(key);}catch{}return null;
}
export function clearAgeTest(id,storage=store()){
 try{if(JSON.parse(storage?.getItem(key)||'null')?.id===id)storage.removeItem(key);}catch{}
}
export async function openAgeTest(attempt,sessionTag,base,{browser=Browser,storage=store(),now=Date.now()}={}){
 const u=new URL(base);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!sessionTag||!attempt?.test||!/^ha-\d{10}-[a-f0-9]{16}-[a-f0-9]{32}$/.test(attempt.id))throw Error('본인인증 설정을 확인해 주세요.');
 if(!storage)throw Error('인증 정보를 보관할 수 없어요. 앱 설정을 확인해 주세요.');
 storage.setItem(key,JSON.stringify({id:attempt.id,sessionTag,expires:now+600000}));
 try{await browser.open({url:`${u.origin}/age-verification.html?attemptId=${encodeURIComponent(attempt.id)}`});}catch(error){clearAgeTest(attempt.id,storage);throw error;}
}
