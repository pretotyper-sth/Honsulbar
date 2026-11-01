export function emailSettings(env = process.env) {
  const provider = env.EMAIL_PROVIDER || (env.BREVO_API_KEY ? 'brevo' : 'resend');
  const key = provider === 'brevo' ? env.BREVO_API_KEY : provider === 'resend' ? env.RESEND_API_KEY : '';
  return { provider, key, from: env.SUPPORT_FROM_EMAIL, to: env.SUPPORT_TO_EMAIL || 'pretotyper.sth@gmail.com' };
}

export function emailReady(env = process.env) {
  const settings = emailSettings(env);
  return !!(settings.key && settings.from);
}

export async function sendNotificationEmail(job, env = process.env, send = fetch) {
  const { provider, key, from, to } = emailSettings(env);
  if (!emailReady(env)) throw new Error('configuration_required');
  const subject = (job.data.test ? '[연동 테스트] ' : '') + (job.data.urgent ? '[혼술바 긴급 신고] 확인이 필요합니다' : '[혼술바] 새 문의가 접수되었습니다');
  const text = (job.data.test ? '실제 신고가 아닌 메일 연결 시험입니다.\n\n' : '') + `새 문의 번호: ${job.data.ticketId}\n관리자 화면에서 내용을 확인하고 답변해 주세요.\nhttps://honsulbar-app.vercel.app/?admin=1`;
  let url, headers, body;
  if (provider === 'brevo') {
    const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(from);
    const sender = match ? { name: match[1].trim() || '혼술바', email: match[2].trim() } : { name: '혼술바', email: from.trim() };
    url = 'https://api.brevo.com/v3/smtp/email';
    headers = { 'Content-Type': 'application/json', 'api-key': key };
    body = { sender, to: [{ email: to }], subject, textContent: text, headers: { IdempotencyKey: job.id } };
  } else {
    url = 'https://api.resend.com/emails';
    headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.id };
    body = { from, to: [to], subject, text };
  }
  const response = await send(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('delivery_failed');
}
