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
