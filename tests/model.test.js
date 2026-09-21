import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialWallet, purchase, remaining, changeRole, addArrival, proximity, transferPoints } from '../src/model.js';
const now = 1000000;
test('seat exchange conserves points and rejects insufficient or invalid payments', () => {
  assert.deepEqual(transferPoints(2000, 500, 500), { payer: 1500, receiver: 1000 });
  assert.deepEqual(transferPoints(500, 2000, 500), { payer: 0, receiver: 2500 });
  assert.throws(() => transferPoints(499, 1000, 500), /부족/);
  assert.throws(() => transferPoints(1000, 1000, -500));
  assert.throws(() => transferPoints(1000, 1000, 0.5));
});
test('entry wine charges 500 points and grants thirty minutes', () => {
  const wallet = purchase(initialWallet, 'wine', now, { welcome: true });
  assert.equal(wallet.balance, 500);
  assert.equal(wallet.drinkId, 'wine');
  assert.equal(remaining(wallet, now), 1800);
});
test('paid drinks debit exactly once and add to remaining time', () => {
  const welcome = purchase({ ...initialWallet, balance: 2000 }, 'wine-hour', now, { welcome: true });
  const wallet = purchase(welcome, 'highball', now + 60000);
  assert.equal(wallet.balance, 500);
  assert.equal(remaining(wallet, now + 60000), 5340);
  assert.throws(() => purchase(wallet, 'wine-hour', now), /포인트/);
  assert.equal(wallet.balance, 500);
});
test('expired time is not subtracted from a new order', () => {
  const welcome = purchase({ ...initialWallet, balance: 1500 }, 'wine-hour', now, { welcome: true });
  const later = now + 7200000;
  const wallet = purchase(welcome, 'highball', later);
  assert.equal(remaining(wallet, later), 1800);
});
test('host time pauses, paid extension is preserved, leaving resumes', () => {
  const welcome = purchase(initialWallet, 'beer', now, { welcome: true });
  let wallet = changeRole(welcome, true, now + 60000);
  assert.equal(remaining(wallet, now + 900000), 1740);
  wallet = purchase(wallet, 'highball', now + 900000, { host: true });
  assert.equal(remaining(wallet, now + 900000), 3540);
  wallet = changeRole(wallet, false, now + 900000);
  assert.equal(remaining(wallet, now + 960000), 3480);
});
test('last seat fills and opens exactly one new branch without mutating original', () => {
  const rooms = [{number:1,count:12},{number:2,count:11}];
  const next = addArrival(rooms);
  assert.deepEqual(next, [{number:1,count:12},{number:2,count:12},{number:3,count:0}]);
  assert.equal(rooms[1].count, 11);
  assert.equal(addArrival(next).length, 3);
  assert.equal(addArrival(next)[2].count, 1);
});
test('distance uses physical neighbors along the U and host hears all', () => {
  assert.equal(proximity(3,4), 1);
  assert.equal(proximity(3,5), .25);
  assert.equal(proximity(3,6), .05);
  assert.equal(proximity(3,8), 0);
  assert.equal(proximity(11,0), 1);
});
