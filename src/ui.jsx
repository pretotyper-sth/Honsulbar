import React from 'react';

const buttonSizes = { small: 'ui-button-small', large: 'ui-button-large', xlarge: 'ui-button-xlarge' };

export function Button({ children, size = 'large', variant = 'primary', color = 'primary', display, className = '', ...props }) {
  const classes = ['ui-button', buttonSizes[size] || buttonSizes.large, `ui-button-${variant}`, `ui-button-${color}`, display === 'block' ? 'ui-button-block' : '', className].filter(Boolean).join(' ');
  return <button className={classes} {...props}>{children}</button>;
}

export function Badge({ children, color = 'blue', className = '', ...props }) {
  return <span className={['ui-badge', `ui-badge-${color}`, className].filter(Boolean).join(' ')} {...props}>{children}</span>;
}

export function BottomSheet({ open, onClose, children, className = '', ariaLabelledBy }) {
  React.useEffect(() => {
    if (!open) return undefined;
    document.documentElement.classList.add('sheet-open');
    const blockBackground = event => {
      if (!event.target.closest?.('.ui-bottom-sheet')) event.preventDefault();
    };
    document.addEventListener('touchmove', blockBackground, { passive: false });
    document.addEventListener('wheel', blockBackground, { passive: false });
    return () => {
      document.documentElement.classList.remove('sheet-open');
      document.removeEventListener('touchmove', blockBackground);
      document.removeEventListener('wheel', blockBackground);
    };
  }, [open]);
  if (!open) return null;
  return <div className="ui-sheet-backdrop" role="presentation" onClick={onClose}>
    <section className={['ui-bottom-sheet', className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={ariaLabelledBy} onClick={event => event.stopPropagation()}>
      <div className="ui-sheet-handle" aria-hidden="true" />
      {children}
    </section>
  </div>;
}

export function FaceConsent({ checked, onChange }) {
  const dialog = React.useRef(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const showDetails = () => dialog.current?.showModal();
  const closeDetails = () => dialog.current?.close();
  return <>
    <div className="face-consent-row">
      <label className="face-consent">
        <input type="checkbox" checked={checked} aria-haspopup="dialog" onChange={() => checked ? onChange(false) : showDetails()}/>
        <span>[필수] 사진 도용 방지용 촬영본·얼굴 비교 정보 처리 동의</span>
      </label>
      <button type="button" className="face-consent-more" aria-label="얼굴 정보 처리 동의 내용 보기" aria-haspopup="dialog" onClick={showDetails}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </button>
    </div>
    <dialog ref={dialog} className="face-consent-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <h2 id={titleId}>얼굴 정보 처리 동의</h2>
      <div id={descriptionId}>
        <p className="face-consent-intro">사진 도용을 막기 위해 얼굴을 비교해요.</p>
        <dl>
          <div><dt>처리 항목</dt><dd>촬영본·얼굴 비교 정보(민감정보)</dd></div>
          <div><dt>이용 기간</dt><dd>검사 중에만 처리하고 즉시 삭제해요.</dd></div>
        </dl>
        <p className="face-consent-refusal">동의 거부 시 사진 등록·입장이 제한돼요.</p>
      </div>
      <div className="face-consent-actions">
        <Button variant="weak" onClick={closeDetails}>{checked ? '닫기' : '나중에'}</Button>
        {!checked && <Button onClick={() => { onChange(true); closeDetails(); }}>동의하기</Button>}
      </div>
    </dialog>
  </>;
}

export function CameraVerificationStatus({ guide, message, state, elapsed }) {
  const waiting=(guide.stage==='prepare'||guide.stage==='compare')&&(state==='starting'||state==='checking');
  const hint=guide.stage==='compare'?(elapsed>=8?'확인 중이에요. 잠시 기다려 주세요.':'움직이지 않아도 돼요.'):guide.stage==='ready'?'눈·코·입이 화면에 보이면 돼요.':'';
  return <div className={`camera-feedback${guide.stage==='error'||state==='unavailable'?' is-error':''}`}>
    {waiting&&<span className="camera-spinner" aria-hidden="true"/>}
    <div role="status" aria-live="polite" aria-atomic="true"><strong>{message}</strong>{hint&&<small>{hint}</small>}</div>
    {guide.stage==='move'&&<progress max="100" value={guide.progress} aria-label="안내한 거리로 이동한 정도"/>}
    {waiting&&elapsed>=8&&<span className="camera-elapsed">{elapsed}초 경과</span>}
  </div>;
}
