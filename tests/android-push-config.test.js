import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { androidPushReady } from '../server/android-push.js';
test('push readiness rejects malformed credentials, wrong projects and invalid signing keys',()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const credentials={type:'service_account',project_id:'test-project',client_email:'sender@test-project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
 const env={HB_FCM_ENABLED:'1',HB_FCM_PROJECT_ID:'test-project',HB_FCM_SERVICE_ACCOUNT_JSON:JSON.stringify(credentials)};
 assert.equal(androidPushReady(env),true);
 for(const changes of [{HB_FCM_ENABLED:'0'},{HB_FCM_PROJECT_ID:'other-project'},{HB_FCM_SERVICE_ACCOUNT_JSON:'not-json'},{HB_FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({...credentials,private_key:'broken'})}])assert.equal(androidPushReady({...env,...changes}),false);
});
