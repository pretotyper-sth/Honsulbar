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

export function FaceCaptureNotice() {
  return <p id="face-capture-notice" className="face-capture-notice">사진 도용 확인에 촬영본과 얼굴 비교 정보(민감정보)를 사용하고 검사 후 바로 삭제해요. 동의하지 않으면 사진 등록과 입장이 어려워요.</p>;
}

export function FaceCaptureConsent({ retry, onCapture }) {
  return <Button size="xlarge" display="block" aria-describedby="face-capture-notice" onClick={onCapture}>
    {retry ? '동의하고 다시 촬영하기' : '동의하고 촬영하기'}
  </Button>;
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
