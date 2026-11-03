// Back always dismisses the topmost UI before leaving the current screen.
export function handleMiniappBack({ dismissDialog, sheet, closeSheet, screen, leaveBar, showExit, exitOpen, cancelExit }) {
  if (dismissDialog()) return;
  if (exitOpen) return cancelExit();
  if (sheet) return closeSheet();
  if (screen === 'bar') return leaveBar();
  showExit();
}

export function subscribeMiniappBack({ window, graniteEvent, onBack, insideToss }) {
  // Keep a browser entry behind this state-driven app, including after refresh.
  if (!window.history.state?.miniappBackGuard) {
    window.history.pushState({ ...window.history.state, miniappBackGuard: true }, '');
  }
  const onPop = () => {
    window.history.pushState({ ...window.history.state, miniappBackGuard: true }, '');
    onBack();
  };
  window.addEventListener('popstate', onPop);
  let off = () => {};
  if (insideToss) {
    try { off = graniteEvent.addEventListener('backEvent', { onEvent: onBack, onError: () => {} }); } catch {}
  }
  return () => { off(); window.removeEventListener('popstate', onPop); };
}

export function navigationBarOptions(dimmed) {
  // Match the web backdrop (#0005) over the warm brand background (#211412).
  return { transparentBackground: !dimmed, backgroundColor: dimmed ? '#160d0c' : null, theme: 'dark' };
}
