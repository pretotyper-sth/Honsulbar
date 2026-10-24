import React, { useEffect, useState } from 'react';
import { API_BASE, getConfig } from './api';

const TOKEN_KEY = 'honsulbar:admin-token:v1';
const STATUS = { pending: '대기', reviewing: '확인 중', answered: '답변 완료', closed: '종료' };
const DAY_LABELS = { signup: '가입', login: '로그인', enter: '입장', leave: '퇴장', waitlist: '대기', purchase: '충전', subscribe: '구독', 'ad-claim': '광고', ticket: '문의', report: '신고', restrict: '제재' };
const styles = {
  page: { height: '100dvh', overflowY: 'auto', maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px', fontFamily: 'inherit', color: '#191f28' },
  card: { border: '1px solid #e5e8eb', borderRadius: 16, padding: 16, margin: '12px 0', background: '#fff' },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #d1d6db', borderRadius: 12, padding: 12, fontSize: 15, font: 'inherit' },
  button: { border: 0, borderRadius: 10, padding: '10px 14px', background: '#3182f6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  weak: { border: 0, borderRadius: 10, padding: '8px 12px', background: '#f2f4f6', color: '#4e5968', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  danger: { border: 0, borderRadius: 10, padding: '8px 12px', background: '#fdeeec', color: '#de3412', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
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

function elapsedLabel(iso) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `접수 후 ${mins}분`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `접수 후 ${hours}시간 ${mins % 60}분`;
  return `접수 후 ${Math.floor(hours / 24)}일 ${hours % 24}시간`;
}

function isOverdue(ticket) {
  return ['pending', 'reviewing'].includes(ticket.status) && Date.now() - new Date(ticket.created_at).getTime() >= 24 * 3600 * 1000;
}

function banLabel(until) {
  if (!until) return '';
  const at = new Date(until);
  if (Number.isNaN(at.getTime()) || at.getFullYear() >= 3000) return '영구 제한 중';
  if (at <= new Date()) return '';
  return `${at.toLocaleString('ko-KR')}까지 제한`;
}

function party(members, id) {
  if (!id) return null;
  return members?.[id] || { id, nickname: id.slice(0, 8) };
}

function contextLine(ctx) {
  if (!ctx || typeof ctx !== 'object' || (!ctx.region && ctx.sameRoom == null)) return '';
  const room = ctx.region ? `${ctx.region} ${ctx.number}호점` : '방 정보 없음';
  const same = ctx.sameRoom == null ? '' : ctx.sameRoom ? ' · 같은 방' : ' · 다른 방·퇴장';
  const seats = [ctx.reporterSeat != null ? `신고자 ${ctx.reporterSeat}석/${ctx.reporterDrink || '-'}` : '', ctx.targetSeat != null ? `대상 ${ctx.targetSeat}석/${ctx.targetDrink || '-'}` : ''].filter(Boolean).join(' · ');
  const at = ctx.at ? ` · ${new Date(ctx.at).toLocaleString('ko-KR')}` : '';
  return `신고 당시 ${room}${same}${seats ? ` · ${seats}` : ''}${at}`;
}

export function AdminPage() {
  const [token, setToken] = useState(readToken);
  const [email, setEmail] = useState('pretotyper.sth@gmail.com');
  const [password, setPassword] = useState('');
  const [loginMode, setLoginMode] = useState('password');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});
  const [message, setMessage] = useState('');
  const [health,setHealth] = useState(null);
  const [liveStats,setLiveStats] = useState(null);
  const [evidence,setEvidence] = useState({});
  useEffect(()=>{
    if(!token)return;
    let stopped=false;
    const refresh=()=>{if(document.hidden)return;adminCall(token,'admin-alert-state').then(r=>{if(!stopped)setLiveStats(r.result);}).catch(()=>{});};
    adminCall(token,'admin-health').then(r=>{if(!stopped)setHealth(r.result);}).catch(()=>{});
    const timer=setInterval(refresh,15000);refresh();
    return()=>{stopped=true;clearInterval(timer);};
  },[token]);
  useEffect(()=>()=>{Object.values(evidence).forEach(url=>URL.revokeObjectURL(url));},[evidence]);
  async function playEvidence(ticket){
    try {
      const {result}=await adminCall(token,'admin-evidence',{id:ticket.id});
      const bytes=Uint8Array.from(atob(result.audio),c=>c.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
      setEvidence({[ticket.id]:url});
    }catch(error){setMessage(error.message);}
  }
  async function testAlert(){
    try {await adminCall(token,'admin-test-alert');setMessage('메일 업체가 시험 메일을 접수했어요. 실제 메일함에서 수신을 확인해 주세요.');}
    catch(error){setMessage(error.message);}
  }

  async function load() {
    if (!token) return;
    setLoading(true);
    try {setData(await adminCall(token,'admin-list',{status,page}));setMessage('');}
    catch(error){
      if(error.status===401||error.status===403){try{sessionStorage.removeItem(TOKEN_KEY);}catch{}setToken(null);}
      setData(null);setMessage(error.message);
    }finally{setLoading(false);}
  }
  useEffect(()=>{load();},[token,status,page]);
  async function passwordLogin(event) {
    event.preventDefault();
    if(loggingIn||!email.trim()||!password)return;
    setLoggingIn(true);setMessage('');
    let candidate,config;
    try {
      config=await getConfig();
      if(!config.supabaseUrl||!config.supabaseKey)throw new Error('관리자 인증 설정을 확인해 주세요.');
      const response=await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});
      const auth=await response.json().catch(()=>({}));
      if(!response.ok||!auth.access_token)throw new Error(response.status===429?'시도가 많아요. 잠시 후 다시 로그인해 주세요.':'이메일 또는 비밀번호를 확인해 주세요.');
      candidate=auth.access_token;
      await adminCall(candidate,'admin-session');
      try{sessionStorage.setItem(TOKEN_KEY,candidate);}catch{}
      setPassword('');setToken(candidate);setData(null);
    }catch(error){
      if(candidate&&config)await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:`Bearer ${candidate}`}}).catch(()=>{});
      setMessage(error.message||'로그인하지 못했어요. 다시 시도해 주세요.');
    }finally{setLoggingIn(false);}
  }
  async function logout(){
    const current=token;
    try{sessionStorage.removeItem(TOKEN_KEY);}catch{}
    setToken(null);setData(null);setEvidence({});setMessage('');setPassword('');
    const config=await getConfig().catch(()=>null);
    if(config&&current)await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:`Bearer ${current}`}}).catch(()=>{});
  }
  async function sendLink(){
    try{
      const config=await getConfig(),redirect=`${location.origin}/?admin=1`;
      const response=await fetch(`${config.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`,{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),create_user:false})});
      setMessage(response.ok?'로그인 링크를 메일로 보냈어요. 메일의 링크를 이 기기에서 열어 주세요.':'로그인 링크를 보내지 못했어요.');
    }catch{setMessage('로그인 링크를 보내지 못했어요.');}
  }
  async function reply(ticket){
    const answer=(answers[ticket.id]??ticket.answer??'').trim();if(!answer)return;
    try{await adminCall(token,'admin-reply',{id:ticket.id,answer});await load();setMessage('답변을 등록했어요. 이용자에게 알림이 전송돼요.');}catch(error){setMessage(error.message);}
  }
  async function changeStatus(ticket,next){
    try{await adminCall(token,'admin-status',{id:ticket.id,status:next});await load();}catch(error){setMessage(error.message);}
  }
  async function restrict(memberId,until,ticket){
    if(!memberId)return;
    if(until==='perm'&&!window.confirm('이 계정을 영구 제한할까요? 방에 있으면 바로 퇴장됩니다.'))return;
    try{
      await adminCall(token,'admin-restrict',{memberId,until,reason:ticket?(reviewNotes[ticket.id]||''):''});
      await load();setMessage(until==='clear'?'이용 제한을 해제했어요.':until==='kick'?'해당 계정을 방에서 퇴장시켰어요.':'이용 제한을 적용했어요.');
    }catch(error){setMessage(error.message);}
  }

  if (!token) return <main style={styles.page}>
    <h1>혼술바 운영 관리</h1>
    <p style={styles.meta}>{loginMode==='password'?'운영자 이메일과 비밀번호로 로그인해요.':'운영자 이메일로 로그인 링크를 받아요.'}</p>
    <form onSubmit={passwordLogin}>
      <label>이메일<input aria-label="관리자 이메일" style={{...styles.input,margin:'6px 0 14px'}} value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="username" required /></label>
      {loginMode==='password'&&<label>비밀번호<input aria-label="관리자 비밀번호" style={{...styles.input,marginTop:6}} value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete="current-password" required /></label>}
      <p>{loginMode==='password'?<button style={styles.button} type="submit" disabled={loggingIn||!password}>{loggingIn?'로그인 중…':'로그인'}</button>:<button type="button" style={styles.button} onClick={sendLink}>로그인 링크 받기</button>}</p>
    </form>
    <button style={styles.weak} onClick={()=>{setLoginMode(loginMode==='password'?'link':'password');setMessage('');setPassword('');}}>{loginMode==='password'?'이메일 링크로 로그인':'비밀번호로 로그인'}</button>
    {message&&<p role="alert" style={styles.meta}>{message}</p>}
  </main>;

  const stats = data?.stats || {};
  const day = stats.day || {};

  return <main style={styles.page}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1>문의·신고</h1>
      <button style={styles.weak} onClick={logout}>로그아웃</button>
    </div>
    {data?.stats && <section style={{ ...styles.card, background: stats.overdue ? '#fff5f5' : '#f9fafb' }}>
      <p style={{ margin: 0, fontWeight: 700 }}>미처리 신고 {stats.openReports ?? 0} · 미처리 문의 {stats.openInquiries ?? 0} · <span style={{ color: stats.overdue ? '#de3412' : undefined }}>24시간 초과 {stats.overdue ?? 0}</span> · 제한 중 {stats.banned ?? 0}</p>
      <p style={{ ...styles.meta, margin: '8px 0 0' }}>오늘 {['signup', 'login', 'enter', 'report', 'purchase', 'subscribe', 'ad-claim', 'restrict'].map(name => `${DAY_LABELS[name]} ${day[name] || 0}`).join(' · ')}</p>
    </section>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {[['', '전체'], ...Object.entries(STATUS)].map(([value, label]) => <button key={value} style={{ ...styles.weak, ...(status === value ? { background: '#e8f3ff', color: '#1b64da' } : {}) }} onClick={() => { setStatus(value); setPage(0); }}>{label}</button>)}
      <button style={styles.weak} onClick={load}>새로고침</button>
    </div>
    {health && <section style={styles.card}><h2>라이브 연결 점검</h2><p style={styles.meta}>토스 로그인 설정 {health.loginConfigured?'있음':'미설정'} · 신고 메일 설정 {health.emailConfigured?'있음':'미설정'} · 음성 DB {health.evidenceSchema?'있음':'미적용'} · 음성 보관 {health.evidenceEnabled?'켜짐':'꺼짐'}</p><p style={styles.meta}>설정 존재 여부이며 실제 인증·수신 성공을 의미하지 않습니다. 최근 미처리 신고 {liveStats?.openReports ?? '-'}건 (화면이 켜져 있을 때 15초 간격 확인)</p><button style={styles.weak} onClick={testAlert}>운영자 시험 메일 보내기</button> <button style={styles.weak} onClick={async()=>{try{await adminCall(token,'admin-retry-alerts');setMessage('재시도 시각이 된 알림을 발송 시도했어요.');}catch(e){setMessage(e.message);}}}>대기 알림 재시도</button><p style={styles.meta}>시험 메일은 하루 3회 한도. 메일함에서 도착을 직접 확인해 주세요. 새 신고 상세는 새로고침으로 확인합니다.</p></section>}
    {message && <p role="alert" style={styles.meta}>{message}</p>}
    {loading && <p role="status" style={styles.meta}>문의·신고를 불러오고 있어요.</p>}
    {data?.outbox?.length > 0 && <p style={styles.meta}>발송 대기 알림 {data.outbox.length}건{data.outbox.some(item => item.last_error === 'configuration_required') ? ' · 메일/푸시 설정이 필요해요' : ''}</p>}
    {data && !data.tickets.length && <p style={styles.meta}>접수된 문의가 없어요.</p>}
    {data?.tickets.map(ticket => {
      const overdue = isOverdue(ticket);
      const reporter = party(data.members, ticket.member_id);
      const target = party(data.members, ticket.target_id);
      const ctx = contextLine(ticket.context);
      const summary = data.summaries?.[ticket.target_id];
      return <section key={ticket.id} style={{ ...styles.card, ...(overdue ? { borderColor: '#f15b50', background: '#fff8f7' } : {}) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong>{ticket.kind === 'report' ? '🚩 신고' : '문의'} · {ticket.category}</strong>
          <span style={{ ...styles.meta, color: overdue ? '#de3412' : undefined, fontWeight: overdue ? 700 : 400 }}>{STATUS[ticket.status]} · {elapsedLabel(ticket.created_at)}{overdue ? ' · 24시간 초과' : ''}</span>
        </div>
        <p style={styles.meta}>{new Date(ticket.created_at).toLocaleString('ko-KR')} · 접수 {reporter ? `${reporter.nickname} (${ticket.member_id?.slice(0, 8) || '탈퇴'})` : '탈퇴'}{target ? ` · 대상 ${target.nickname} (${ticket.target_id.slice(0, 8)})` : ''}{banLabel(target?.banned_until) ? ` · ${banLabel(target.banned_until)}` : ''}{banLabel(reporter?.banned_until) ? ` · 접수자 ${banLabel(reporter.banned_until)}` : ''}</p>
        {ctx && <p style={styles.meta}>{ctx}</p>}
        {ticket.kind === 'report' && <><p style={styles.meta}>{ticket.context?.priority === 'urgent' ? '긴급 우선 확인 · ' : ''}{ticket.context?.audioRecorded ? '참여자가 제출한 음성 있음 · 조작 가능성을 포함해 검토하세요.' : '첨부 음성 없음 · 신고 내용은 미확인 주장입니다.'}{summary ? ` 최근 30일 ${summary.reports}건 / 서로 다른 신고자 ${summary.reporters}명` : ''}</p><p style={styles.meta}>신고 횟수만으로 제재하지 마세요. 이용 기록·구체적 설명·기존 확인된 조치를 검토해 주세요.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{[['추가 설명 요청','신고를 확인하고 있어요. 당시 상대가 한 말과 상황을 기억나는 범위에서 알려주세요. 상대와의 연결 제한은 유지돼요.'],['확인 어려움 안내','현재 설명과 이용 기록만으로 위반 여부를 확정하기 어려워요. 확보된 자료만으로 확인이 어려우며, 상대와의 연결 제한은 유지돼요. 추가 설명은 문의로 보내주세요.'],['검토 결과 안내','신고 내용과 이용 기록을 검토해 필요한 조치를 진행했어요. 상대와의 연결 제한은 유지되며, 상대방의 개인정보와 구체적인 계정 정보는 안내하지 않아요.']].map(([label,text])=><button key={label} style={styles.weak} onClick={()=>setAnswers(v=>({...v,[ticket.id]:text}))}>{label}</button>)}</div><textarea aria-label="조치 근거" style={{...styles.input,marginTop:10}} maxLength={80} placeholder="조치 근거 (제재 전 8자 이상, 신고자 정보 제외)" value={reviewNotes[ticket.id] || ''} onChange={e=>setReviewNotes(v=>({...v,[ticket.id]:e.target.value}))}/></>}

        {ticket.context?.audioRecorded && <div><p style={styles.meta}>음성 보관 종료: {new Date(ticket.context.audioExpiresAt).toLocaleString('ko-KR')} · 진위·화자·맥락이 자동 검증된 자료가 아닙니다.</p>{evidence[ticket.id] ? <audio controls controlsList="nodownload" src={evidence[ticket.id]}/> : <button style={styles.weak} onClick={()=>playEvidence(ticket)}>신고 음성 열람 (접근 기록 남음)</button>}</div>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.message}</p>
        <textarea style={{ ...styles.input, minHeight: 90 }} placeholder="답변을 입력하면 이용자에게 알림이 가요." value={answers[ticket.id] ?? ticket.answer ?? ''} onChange={e => setAnswers(v => ({ ...v, [ticket.id]: e.target.value }))} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button style={styles.button} onClick={() => reply(ticket)}>{ticket.answer ? '답변 수정' : '답변 보내기'}</button>
          {ticket.status === 'pending' && <button style={styles.weak} onClick={() => changeStatus(ticket, 'reviewing')}>확인 중으로</button>}
          {ticket.status !== 'closed' && <button style={styles.weak} onClick={() => changeStatus(ticket, 'closed')}>종료</button>}
        </div>
        {ticket.target_id && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={styles.meta}>대상 조치</span>
          <button style={styles.weak} onClick={() => restrict(ticket.target_id, 'kick', ticket)}>즉시 퇴장</button>
          <button style={styles.weak} onClick={() => restrict(ticket.target_id, '24h', ticket)}>24시간 제한</button>
          <button style={styles.weak} onClick={() => restrict(ticket.target_id, '7d', ticket)}>7일 제한</button>
          <button style={styles.danger} onClick={() => restrict(ticket.target_id, 'perm', ticket)}>영구 제한</button>
          {target?.banned_until && new Date(target.banned_until) > new Date() && <button style={styles.weak} onClick={() => restrict(ticket.target_id, 'clear', ticket)}>제한 해제</button>}
        </div>}
        {ticket.member_id && ticket.kind === 'report' && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={styles.meta}>접수자 조치</span>
          <button style={styles.weak} onClick={() => restrict(ticket.member_id, 'kick', ticket)}>즉시 퇴장</button>
          <button style={styles.weak} onClick={() => restrict(ticket.member_id, '24h', ticket)}>24시간 제한</button>
          <button style={styles.danger} onClick={() => restrict(ticket.member_id, 'perm', ticket)}>영구 제한</button>
          {reporter?.banned_until && new Date(reporter.banned_until) > new Date() && <button style={styles.weak} onClick={() => restrict(ticket.member_id, 'clear', ticket)}>제한 해제</button>}
        </div>}
      </section>;
    })}
    <div style={{ display: 'flex', gap: 8 }}>
      {page > 0 && <button style={styles.weak} onClick={() => setPage(p => p - 1)}>이전</button>}
      {data?.hasMore && <button style={styles.weak} onClick={() => setPage(p => p + 1)}>다음</button>}
    </div>
  </main>;
}
