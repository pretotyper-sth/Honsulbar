import React, { useEffect, useState } from 'react';
import { API_BASE, getConfig } from './api';

const TOKEN_KEY = 'honsulbar:admin-token:v1';
const STATUS = { pending: '대기', reviewing: '확인 중', answered: '답변 완료', closed: '종료' };
const styles = {
  page: { maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px', fontFamily: 'inherit', color: '#191f28' },
  card: { border: '1px solid #e5e8eb', borderRadius: 16, padding: 16, margin: '12px 0', background: '#fff' },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d6db', borderRadius: 12, padding: 12, fontSize: 15, font: 'inherit' },
  button: { border: 0, borderRadius: 10, padding: '10px 14px', background: '#3182f6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  weak: { border: 0, borderRadius: 10, padding: '8px 12px', background: '#f2f4f6', color: '#4e5968', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  meta: { color: '#6b7684', fontSize: 13 },
};

function readToken() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromLink = hash.get('access_token');
  if (fromLink) {
    try { sessionStorage.setItem(TOKEN_KEY, fromLink); } catch {}
    history.replaceState(null, '', `${location.pathname}?admin=1`);
    return fromLink;
  }
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function adminCall(token, action, data = {}) {
  const response = await fetch(`${API_BASE}/api/service`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...data }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || '요청을 완료하지 못했어요.'); error.status = response.status; throw error; }
  return body;
}

export function AdminPage() {
  const [token, setToken] = useState(readToken);
  const [email, setEmail] = useState('pretotyper.sth@gmail.com');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState('');

  async function load() {
    if (!token) return;
    try { setData(await adminCall(token, 'admin-list', { status, page })); setMessage(''); }
    catch (e) {
      if (e.status === 401 || e.status === 403) { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} setToken(null); }
      setMessage(e.message);
    }
  }
  useEffect(() => { load(); }, [token, status, page]);

  async function sendLink() {
    try {
      const config = await getConfig();
      const redirect = `${location.origin}/?admin=1`;
      const response = await fetch(`${config.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, { method: 'POST', headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), create_user: true }) });
      setMessage(response.ok ? '로그인 링크를 메일로 보냈어요. 메일의 링크를 이 기기에서 열어 주세요.' : '로그인 링크를 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
    } catch { setMessage('로그인 링크를 보내지 못했어요.'); }
  }
  async function reply(ticket) {
    const answer = (answers[ticket.id] ?? ticket.answer ?? '').trim();
    if (!answer) return;
    try { await adminCall(token, 'admin-reply', { id: ticket.id, answer }); setMessage('답변을 등록했어요. 이용자에게 알림이 전송돼요.'); load(); }
    catch (e) { setMessage(e.message); }
  }
  async function changeStatus(ticket, next) {
    try { await adminCall(token, 'admin-status', { id: ticket.id, status: next }); load(); }
    catch (e) { setMessage(e.message); }
  }

  if (!token) return <main style={styles.page}>
    <h1>혼술바 운영 관리</h1>
    <p style={styles.meta}>운영자 이메일로 로그인 링크를 받아 문의와 신고를 확인해요.</p>
    <input style={styles.input} value={email} onChange={e => setEmail(e.target.value)} type="email" />
    <p><button style={styles.button} onClick={sendLink}>로그인 링크 받기</button></p>
    {message && <p style={styles.meta}>{message}</p>}
  </main>;

  return <main style={styles.page}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1>문의·신고</h1>
      <button style={styles.weak} onClick={() => { try { sessionStorage.removeItem(TOKEN_KEY); } catch {} setToken(null); }}>로그아웃</button>
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[['', '전체'], ...Object.entries(STATUS)].map(([value, label]) => <button key={value} style={{ ...styles.weak, ...(status === value ? { background: '#e8f3ff', color: '#1b64da' } : {}) }} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}
      <button style={styles.weak} onClick={load}>새로고침</button>
    </div>
    {message && <p style={styles.meta}>{message}</p>}
    {data?.outbox?.length > 0 && <p style={styles.meta}>발송 대기 알림 {data.outbox.length}건{data.outbox.some(item => item.last_error === 'configuration_required') ? ' · 메일/푸시 설정이 필요해요' : ''}</p>}
    {data && !data.tickets.length && <p style={styles.meta}>접수된 문의가 없어요.</p>}
    {data?.tickets.map(ticket => <section key={ticket.id} style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{ticket.kind === 'report' ? '🚩 신고' : '문의'} · {ticket.category}</strong>
        <span style={styles.meta}>{STATUS[ticket.status]}</span>
      </div>
      <p style={styles.meta}>{new Date(ticket.created_at).toLocaleString('ko-KR')} · 회원 {ticket.member_id?.slice(0, 8) || '탈퇴'}{ticket.target_id ? ` · 대상 ${ticket.target_id.slice(0, 8)}` : ''}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.message}</p>
      <textarea style={{ ...styles.input, minHeight: 90 }} placeholder="답변을 입력하면 이용자에게 알림이 가요." value={answers[ticket.id] ?? ticket.answer ?? ''} onChange={e => setAnswers(v => ({ ...v, [ticket.id]: e.target.value }))} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button style={styles.button} onClick={() => reply(ticket)}>{ticket.answer ? '답변 수정' : '답변 보내기'}</button>
        {ticket.status === 'pending' && <button style={styles.weak} onClick={() => changeStatus(ticket, 'reviewing')}>확인 중으로</button>}
        {ticket.status !== 'closed' && <button style={styles.weak} onClick={() => changeStatus(ticket, 'closed')}>종료</button>}
      </div>
    </section>)}
    <div style={{ display: 'flex', gap: 8 }}>
      {page > 0 && <button style={styles.weak} onClick={() => setPage(p => p - 1)}>이전</button>}
      {data?.hasMore && <button style={styles.weak} onClick={() => setPage(p => p + 1)}>다음</button>}
    </div>
  </main>;
}
