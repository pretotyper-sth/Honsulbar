import test from 'node:test';
import assert from 'node:assert/strict';
import {emailReady,sendNotificationEmail} from '../server/notification-email.js';
const job={id:'job-1',data:{ticketId:'ticket-1',urgent:true,message:'private report body'}};
test('Brevo sends urgent ticket metadata without the private report body',async()=>{
  let request;
  await sendNotificationEmail(job,{EMAIL_PROVIDER:'brevo',BREVO_API_KEY:'test',SUPPORT_FROM_EMAIL:'혼술바 <sender@example.com>'},async(url,options)=>{request={url,...options};return {ok:true};});
  const body=JSON.parse(request.body);
  assert.equal(request.url,'https://api.brevo.com/v3/smtp/email');
  assert.equal(body.sender.email,'sender@example.com');
  assert.equal(body.to[0].email,'pretotyper.sth@gmail.com');
  assert.match(body.subject,/긴급 신고/);
  assert.match(body.textContent,/ticket-1/);
  assert.ok(!body.textContent.includes('private report body'));
});
test('missing Brevo settings never attempt a send and provider rejection remains a failure',async()=>{
  assert.equal(emailReady({EMAIL_PROVIDER:'brevo',RESEND_API_KEY:'wrong-provider',SUPPORT_FROM_EMAIL:'sender@example.com'}),false);
  await assert.rejects(sendNotificationEmail(job,{EMAIL_PROVIDER:'brevo'},async()=>assert.fail('must not send')),/configuration_required/);
  await assert.rejects(sendNotificationEmail(job,{EMAIL_PROVIDER:'brevo',BREVO_API_KEY:'test',SUPPORT_FROM_EMAIL:'sender@example.com'},async()=>({ok:false})),/delivery_failed/);
});
test('existing Resend configuration remains supported',async()=>{
  await sendNotificationEmail({...job,data:{ticketId:'ticket-2',urgent:false}},{RESEND_API_KEY:'test',SUPPORT_FROM_EMAIL:'sender@example.com'},async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'job-1');assert.ok(!JSON.parse(options.body).subject.includes('긴급'));return {ok:true};});
});
