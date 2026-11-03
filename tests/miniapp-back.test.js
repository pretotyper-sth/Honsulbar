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

test('Toss root preserves the native exit alert without touching browser history', () => {
  const forbidden = () => { throw new Error('root exit must stay native'); };
  const off = subscribeMiniappBack({ window: {history: {pushState: forbidden}, addEventListener: forbidden}, graniteEvent: {addEventListener: forbidden}, insideToss: true, onBack: forbidden });
  off();
});

test('only an open sheet or bar intercepts native back and cleanup restores root handling', () => {
  let native, count=0, removed=0;
  const off = subscribeMiniappBack({window: {}, graniteEvent: {addEventListener(name, {onEvent}) {assert.equal(name, 'backEvent');native=onEvent;return () => removed++;}}, insideToss: true, interceptNative: true, onBack: () => count++});
  native();off();assert.equal(count,1);assert.equal(removed,1);
});

test('browser fallback preserves its guard across repeated subscriptions', () => {
  let pop, pushes=0, count=0;
  const window={history:{state:null,pushState(state){this.state=state;pushes++;}},addEventListener(_,cb){pop=cb;},removeEventListener(_,cb){assert.equal(cb,pop);}};
  const subscribe=()=>subscribeMiniappBack({window,insideToss:false,onBack:()=>count++});
  let off=subscribe();pop();off();off=subscribe();off();
  assert.equal(count,1);assert.equal(pushes,2);
});

test('native layout stays transparent and light while overlays open and close', () => {
  assert.deepEqual(navigationBarOptions(true), { transparentBackground: true, backgroundColor: null, theme: 'light' });
  assert.deepEqual(navigationBarOptions(false), { transparentBackground: true, backgroundColor: null, theme: 'light' });
});
