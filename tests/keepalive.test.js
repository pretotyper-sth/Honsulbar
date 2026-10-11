import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutoff, eventPath, tick } from '../scripts/keepalive.js';

test('event paths stay on the keepalive name', () => {
  assert.equal(eventPath(), '/rest/v1/hb_events?name=eq.keepalive');
  assert.match(eventPath(['created_at=lt.2026-10-11T00%3A00%3A00.000Z']), /name=eq\.keepalive&created_at=lt\./);
});

test('cutoff keeps the newest rows and ignores a short list', () => {
  const rows = [{ created_at: 'c' }, { created_at: 'b' }, { created_at: 'a' }];
  assert.equal(cutoff(rows, 3), null);
  assert.equal(cutoff(rows, 2), 'b');
});

test('tick writes one row, updates it, then drops rows past the cap', async () => {
  const rows = [];
  let clock = 0;
  const client = {
    async insert(data) {
      const row = { created_at: `2026-10-11T00:00:${String(clock++).padStart(2, '0')}.000Z`, data };
      rows.push(row);
      return row;
    },
    async update(stamp, data) {
      const row = rows.find(item => item.created_at === stamp);
      row.data = data;
      return row;
    },
    async list() {
      return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    async removeOlderThan(stamp) {
      const gone = rows.filter(item => item.created_at < stamp);
      for (const item of gone) rows.splice(rows.indexOf(item), 1);
      return gone;
    },
  };
  const first = await tick(client, 2);
  assert.equal(first.removed, 0);
  assert.equal(first.kept, 1);
  assert.equal(rows[0].data.phase, 'touched');
  await tick(client, 2);
  const third = await tick(client, 2);
  assert.equal(third.kept, 2);
  assert.equal(third.removed, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows.every(item => item.data.phase === 'touched'), true);
});

test('the admin day line does not list keepalive', () => {
  const source = readFileSync(new URL('../src/admin.jsx', import.meta.url), 'utf8');
  const line = source.split('\n').find(row => row.includes("'signup', 'login', 'enter'"));
  assert.ok(line);
  assert.equal(line.includes('keepalive'), false);
});
