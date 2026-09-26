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

const PERM_COPY = {
  microphone: { title: '마이크 사용을 허용할까요?', body: '바에서 이야기하려면 마이크가 필요해요.', allow: '허용', deny: '허용 안 함' },
  camera: { title: '카메라 사용을 허용할까요?', body: '얼굴 확인을 위해 카메라를 사용해요.', allow: '허용', deny: '허용 안 함' },
};

export function PermissionPrompt({ open, kind, onAllow, onDeny }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const html = document.documentElement;
    const already = html.classList.contains('sheet-open');
    html.classList.add('sheet-open');
    return () => { if (!already) html.classList.remove('sheet-open'); };
  }, [open]);
  if (!open) return null;
  const copy = PERM_COPY[kind] || PERM_COPY.microphone;
  return <div className="perm-backdrop" role="presentation">
    <section className="perm-sheet" role="dialog" aria-modal="true" aria-labelledby="perm-title">
      <div className="ui-sheet-handle" aria-hidden="true" />
      <h2 id="perm-title">{copy.title}</h2>
      <p>{copy.body}</p>
      <div className="perm-actions">
        <Button color="dark" variant="weak" size="xlarge" onClick={onDeny}>{copy.deny}</Button>
        <Button size="xlarge" onClick={onAllow}>{copy.allow}</Button>
      </div>
    </section>
  </div>;
}
