import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMiniappBack, subscribeMiniappBack, navigationBarOptions } from '../src/miniapp-back.js';

test('back dismisses dialog, exit modal, nested sheet, and bar before requesting app exit', () => {
  const calls = [];
  const state = { dismissDialog: () => false, closeSheet: () => calls.push('sheet'), leaveBar: () => calls.push('leave'), showExit: () => calls.push('exit'), cancelExit: () => calls.push('cancel'), screen: 'lobby' };
  handleMiniappBack({ ...state, dismissDialog: () => true, sheet: 'profile' });
  assert.deepEqual(calls, []);
  handleMiniappBack({ ...state, exitOpen: true });
  handleMiniappBack({ ...state, sheet: 'legal', screen: 'bar' });
  handleMiniappBack({ ...state, screen: 'bar' });
  for (const screen of ['lobby', 'onboarding', 'loading']) handleMiniappBack({ ...state, screen });
  assert.deepEqual(calls, ['cancel', 'sheet', 'leave', 'exit', 'exit', 'exit']);
});

test('native and browser back share the handler and unsubscribe; refresh does not add another guard', () => {
  let pop, native, count = 0, pushes = 0, removed = 0;
  const window = { history: { state: null, pushState(state) { this.state = state; pushes++; } }, addEventListener(_, cb) { pop = cb; }, removeEventListener(_, cb) { assert.equal(cb, pop); removed++; } };
  const graniteEvent = { addEventListener(event, { onEvent }) { assert.equal(event, 'backEvent'); native = onEvent; return () => removed++; } };
  const subscribe = () => subscribeMiniappBack({ window, graniteEvent, insideToss: true, onBack: () => count++ });
  let off = subscribe();
  native(); pop();
  assert.equal(count, 2);
  assert.equal(pushes, 2);
  off(); off = subscribe();
  assert.equal(pushes, 2);
  off(); assert.equal(removed, 4);
});

test('native layout stays transparent and light while overlays open and close', () => {
  assert.deepEqual(navigationBarOptions(true), { transparentBackground: true, backgroundColor: null, theme: 'light' });
  assert.deepEqual(navigationBarOptions(false), { transparentBackground: true, backgroundColor: null, theme: 'light' });
});
