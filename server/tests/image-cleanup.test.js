import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { startImageCleanup } from '../services/image-operations.js';

test('cleanup starts on boot, never overlaps, drains on shutdown and stops scheduling', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const stop = startImageCleanup({ async recoverPending() { calls++; await gate; } });
  await nextTurn(); assert.equal(calls, 1);
  t.mock.timers.tick(120000); await nextTurn(); assert.equal(calls, 1);
  let drained = false;
  const closing = stop().then(() => { drained = true; });
  await nextTurn(); assert.equal(drained, false);
  release(); await closing; assert.equal(drained, true);
  t.mock.timers.tick(120000); await nextTurn(); assert.equal(calls, 1);
});

test('cleanup logs a failure and retries on the next interval', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let calls = 0; const events = [];
  const stop = startImageCleanup({ async recoverPending() { if (++calls === 1) throw new Error('Temporary failure'); } }, { logger: (event) => events.push(event) });
  try {
    await nextTurn(); assert.deepEqual(events, ['image_cleanup_failed']);
    t.mock.timers.tick(60000); await nextTurn(); assert.equal(calls, 2);
  } finally { await stop(); }
});
