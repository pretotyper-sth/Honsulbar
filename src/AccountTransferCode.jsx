import React from 'react';
import { Button } from './ui';

export function AccountTransferCode({ info, now, onCopy, onRenew, busy, target = 'Android' }) {
  const valid = info && Date.parse(info.expires) > now;
  return <section className="account-transfer-panel">
    <p className="eyebrow">계정 연결</p>
    <h2 id="sheet-title">{target}에서도 같은 계정으로</h2>
    <p className="sheet-description">{target === 'Android' ? 'Android 앱의 계정 연결에 코드를 입력하고 Google·카카오로 로그인해 주세요.' : '앱인토스의 계정 연결에 코드를 입력하고 토스로 로그인해 주세요.'} 프로필과 잔액이 그대로 연결돼요.</p>
    <label className="profile-field"><span>연결 코드</span><input aria-label="연결 코드" value={info?.code || ''} readOnly spellCheck={false} autoComplete="off" onFocus={event => event.target.select()}/></label>
    <p className="account-transfer-hint">{busy && !info ? '코드를 발급하는 중이에요.' : valid ? '5분 동안 한 번만 사용할 수 있어요. 코드는 본인 기기에만 입력해 주세요.' : '코드가 만료됐어요. 새 코드를 받아 주세요.'}</p>
    <div className="actions"><Button disabled={busy || !valid} onClick={onCopy}>코드 복사</Button><Button variant="weak" disabled={busy} onClick={onRenew}>새 코드 받기</Button></div>
    <p className="account-transfer-footnote">이미 가입한 다른 계정의 프로필·잔액은 합치지 않아요.</p>
  </section>;
}

export function AccountTransferEntry({ connect, code, onChange, onToggle, busy, source = '앱인토스' }) {
  return <div className="account-transfer-entry"><Button display="block" variant="weak" disabled={busy} onClick={onToggle}>{connect ? '새 계정으로 시작하기' : `${source} 계정 연결`}</Button>{connect && <label className="profile-field"><span>{source}에서 받은 연결 코드</span><input aria-label={`${source} 연결 코드`} value={code} onChange={event => onChange(event.target.value)} maxLength={22} autoComplete="off" spellCheck={false}/></label>}</div>;
}
