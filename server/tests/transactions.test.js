import test from 'node:test';
import assert from 'node:assert/strict';
import { transaction } from '../config/db.js';

test('failed rollback destroys a connection instead of returning an open transaction to the pool', async () => {
  let destroyed = false, released = false;
  const connection = {
    async query() {}, async beginTransaction() {}, async rollback() { throw new Error('Connection lost'); },
    destroy() { destroyed = true; }, release() { released = true; }
  };
  await assert.rejects(() => transaction({ async getConnection() { return connection; } }, async () => { throw new Error('Original operation failed'); }), /Original operation failed/);
  assert.equal(destroyed, true); assert.equal(released, false);
});

for (const boundary of ['beginTransaction', 'commit']) test(`${boundary} response loss destroys the uncertain session without replay`, async () => {
  const calls = [];
  const connection = {
    async query() {}, async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); }, destroy() { calls.push('destroy'); }
  };
  connection[boundary] = async () => { throw new Error('response lost'); };
  let operations = 0;
  await assert.rejects(() => transaction({ async getConnection() { return connection; } }, async () => { operations++; }), /response lost/);
  assert.equal(operations, boundary === 'commit' ? 1 : 0);
  assert.ok(calls.includes('destroy'));
  assert.ok(!calls.includes('release'));
  assert.ok(!calls.includes('rollback'));
});

test('query timeout destroys the session; an ordinary operation failure rolls back and releases', async () => {
  for (const timeout of [false, true]) {
    const calls = [];
    const connection = { async query() {}, async beginTransaction() {}, async commit() { assert.fail('must not commit'); },
      async rollback() { calls.push('rollback'); }, release() { calls.push('release'); }, destroy() { calls.push('destroy'); } };
    await assert.rejects(() => transaction({ async getConnection() { return connection; } }, async () => {
      throw Object.assign(new Error('operation failed'), timeout ? { code: 'PROTOCOL_SEQUENCE_TIMEOUT' } : {});
    }), /operation failed/);
    assert.deepEqual(calls, timeout ? ['destroy'] : ['rollback', 'release']);
  }
});
