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
  const descriptionId = React.useId();
  return <div className="face-consent-block">
    <label className="face-consent">
      <input type="checkbox" checked={checked} aria-describedby={descriptionId} onChange={event=>onChange(event.target.checked)}/>
      <span>[필수] 사진 도용 방지용 촬영본·얼굴 비교 정보 처리 동의</span>
    </label>
    <div id={descriptionId} className="face-consent-info">
      <p>처리 항목: 촬영본·얼굴 비교 정보(민감정보)</p>
      <p>서버 검사 중에만 처리하고 검사 후 즉시 삭제해요.</p>
      <p>거부할 수 있으며, 미동의 시 사진 등록·입장이 제한돼요.</p>
    </div>
  </div>;
}

export function CameraVerificationStatus({ guide, message, state, elapsed }) {
  const waiting=(guide.stage==='prepare'||guide.stage==='compare')&&(state==='starting'||state==='checking');
  const hint=guide.stage==='compare'?(elapsed>=8?'조금 더 걸리고 있어요. 잠시만 기다려 주세요.':'움직이지 않아도 돼요.'):guide.stage==='ready'?'밝은 곳에서 얼굴 전체가 보이게 맞춰 주세요.':'';
  return <div className={`camera-feedback${guide.stage==='error'||state==='unavailable'?' is-error':''}`}>
    {waiting&&<span className="camera-spinner" aria-hidden="true"/>}
    <div role="status" aria-live="polite" aria-atomic="true"><strong>{message}</strong>{hint&&<small>{hint}</small>}</div>
    {guide.stage==='move'&&<progress max="100" value={guide.progress} aria-label="안내한 거리로 이동한 정도"/>}
    {waiting&&elapsed>=8&&<span className="camera-elapsed">{elapsed}초 경과</span>}
  </div>;
}
