import test from 'node:test';
import assert from 'node:assert/strict';
import { assertIsolatedInstance, assertOwnedDatabase } from '../scripts/assert-isolated.js';

test('isolation refuses missing identity before connecting and refuses mismatched server before writes', async () => {
  let connections = 0, closed = 0;
  const env = { FINDIT_ISOLATED_DATADIR: 'C:/temporary/findit-mysql-owned/data', DB_HOST: '127.0.0.1', DB_PORT: '12345', DB_USER: 'test', DB_PASSWORD: 'test', DB_NAME: 'findit_db' };
  const open = async () => { connections++; return { async query(sql) { assert.match(sql, /^SELECT @@datadir/); return [[{ directory: env.FINDIT_ISOLATED_DATADIR, port: 12346 }]]; }, async end() { closed++; } }; };
  await assert.rejects(() => assertIsolatedInstance({}, open), /isolated/);
  assert.equal(connections, 0);
  await assert.rejects(() => assertIsolatedInstance(env, open), /mismatch/);
  assert.equal(connections, 1); assert.equal(closed, 1);
  const owned = 'findit_test_' + 'a'.repeat(24);
  assertOwnedDatabase(owned, owned);
  for (const name of ['findit_db', 'findit_test_' + 'b'.repeat(24), 'other']) assert.throws(() => assertOwnedDatabase(name, owned));
});
