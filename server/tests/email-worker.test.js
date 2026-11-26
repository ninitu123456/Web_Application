import test from 'node:test';
import assert from 'node:assert/strict';
test('retryOnDeadlock reruns only deadlocked transactions, a bounded number of times', async () => {
  const { retryOnDeadlock } = await import('../services/email-worker.js');
  let calls = 0;
  assert.equal(await retryOnDeadlock(async () => { calls++; if (calls < 3) throw Object.assign(new Error('d'), { code: 'ER_LOCK_DEADLOCK' }); return 'ok'; }), 'ok');
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(() => retryOnDeadlock(async () => { calls++; throw Object.assign(new Error('d'), { code: 'ER_LOCK_DEADLOCK' }); }), { code: 'ER_LOCK_DEADLOCK' });
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(() => retryOnDeadlock(async () => { calls++; throw new Error('other'); }), /other/);
  assert.equal(calls, 1);
});
