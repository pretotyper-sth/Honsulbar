import React, { useEffect, useRef } from 'react';
import { Button } from './ui';

export function ExitConfirm({ open, onClose, onConfirm }) {
  const cancel = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    document.documentElement.classList.add('exit-open');
    cancel.current?.focus();
    return () => { document.documentElement.classList.remove('exit-open'); previous?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return <div className="exit-backdrop" onClick={onClose}>
    <section className="exit-confirm" role="dialog" aria-modal="true" aria-labelledby="exit-title" onClick={event => event.stopPropagation()} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = event.currentTarget.querySelectorAll('button');
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[1].focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[1]) { event.preventDefault(); buttons[0].focus(); }
      }
    }}>
      <h2 id="exit-title">혼술바를 종료할까요?</h2>
      <div className="actions"><button ref={cancel} className="ui-button ui-button-large ui-button-dark ui-button-weak" onClick={onClose}>취소</button><Button onClick={onConfirm}>종료하기</Button></div>
    </section>
  </div>;
}
