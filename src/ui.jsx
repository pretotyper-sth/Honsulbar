import React from 'react';

const buttonSizes = { small: 'ui-button-small', large: 'ui-button-large', xlarge: 'ui-button-xlarge' };

export function Button({ children, size = 'large', variant = 'primary', color = 'primary', display, className = '', ...props }) {
  const classes = ['ui-button', buttonSizes[size] || buttonSizes.large, `ui-button-${variant}`, `ui-button-${color}`, display === 'block' ? 'ui-button-block' : '', className].filter(Boolean).join(' ');
  return <button className={classes} {...props}>{children}</button>;
}

export function Badge({ children, color = 'blue', className = '', ...props }) {
  return <span className={['ui-badge', `ui-badge-${color}`, className].filter(Boolean).join(' ')} {...props}>{children}</span>;
}

export function BottomSheet({ open, onClose, children, className = '', maxHeight, ariaLabelledBy }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const { body, documentElement } = document;
    const scroller = document.querySelector('.app');
    const scrollY = scroller ? scroller.scrollTop : window.scrollY;
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width, appOverflow: scroller?.style.overflow || '' };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${window.scrollY}px`;
    body.style.width = '100%';
    if (scroller) scroller.style.overflow = 'hidden';
    documentElement.classList.add('sheet-open');
    const blockBackground = event => {
      if (!event.target.closest?.('.ui-bottom-sheet')) event.preventDefault();
    };
    document.addEventListener('touchmove', blockBackground, { passive: false });
    document.addEventListener('wheel', blockBackground, { passive: false });
    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      if (scroller) scroller.style.overflow = previous.appOverflow;
      documentElement.classList.remove('sheet-open');
      document.removeEventListener('touchmove', blockBackground);
      document.removeEventListener('wheel', blockBackground);
      if (scroller) scroller.scrollTop = scrollY;
      else window.scrollTo(0, scrollY);
    };
  }, [open]);
  if (!open) return null;
  return <div className="ui-sheet-backdrop" role="presentation" onClick={onClose}>
    <section className={['ui-bottom-sheet', className].filter(Boolean).join(' ')} style={maxHeight ? { maxHeight } : undefined} role="dialog" aria-modal="true" aria-labelledby={ariaLabelledBy} onClick={event => event.stopPropagation()}>
      <div className="ui-sheet-handle" aria-hidden="true" />
      {children}
    </section>
  </div>;
}
