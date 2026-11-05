import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertIsolatedInstance, assertOwnedDatabase } from '../scripts/assert-isolated.js';

test('isolation refuses missing identity before connecting and refuses mismatched server before writes', async () => {
  let connections = 0, closed = 0;
  const env = { FINDIT_ISOLATED_DATADIR: join(tmpdir(), 'findit-mysql-owned', 'data'), DB_HOST: '127.0.0.1', DB_PORT: '12345', DB_USER: 'test', DB_PASSWORD: 'test', DB_NAME: 'findit_db' };
  const open = async () => { connections++; return { async query(sql) { assert.match(sql, /^SELECT @@datadir/); return [[{ directory: env.FINDIT_ISOLATED_DATADIR, port: 12346 }]]; }, async end() { closed++; } }; };
  await assert.rejects(() => assertIsolatedInstance({}, open), /isolated/);
  assert.equal(connections, 0);
  await assert.rejects(() => assertIsolatedInstance(env, open), /mismatch/);
  assert.equal(connections, 1); assert.equal(closed, 1);
  const owned = 'findit_test_' + 'a'.repeat(24);
  assertOwnedDatabase(owned, owned);
  for (const name of ['findit_db', 'findit_test_' + 'b'.repeat(24), 'other']) assert.throws(() => assertOwnedDatabase(name, owned));
});

test('isolation independently rejects forbidden targets before connecting', async () => {
  const env = { FINDIT_ISOLATED_DATADIR: join(tmpdir(), 'findit-mysql-owned', 'data'), DB_HOST: '127.0.0.1', DB_PORT: '45000', DB_USER: 'test', DB_PASSWORD: '', DB_NAME: 'findit_db' };
  const open = async () => assert.fail('an unsafe target must never be connected');
  for (const port of ['3306', '3311', '', '0', '65536', 'NaN']) {
    await assert.rejects(() => assertIsolatedInstance({ ...env, DB_PORT: port }, open), /port/);
  }
  await assert.rejects(() => assertIsolatedInstance({ ...env, DB_HOST: 'production.example' }, open), /isolated/);
  for (const directory of [tmpdir(), join(tmpdir(), 'other', 'data'), join(tmpdir(), 'findit-mysql-owned', 'data', 'nested'), join(tmpdir(), '..', 'findit-mysql-owned', 'data')]) {
    await assert.rejects(() => assertIsolatedInstance({ ...env, FINDIT_ISOLATED_DATADIR: directory }, open), /datadir/);
  }
});

test('isolation validates the actual server identity and closes every opened connection', async () => {
  const env = { FINDIT_ISOLATED_DATADIR: join(tmpdir(), 'findit-mysql-owned', 'data'), DB_HOST: '127.0.0.1', DB_PORT: '45000', DB_USER: 'test', DB_PASSWORD: '', DB_NAME: 'findit_db' };
  for (const instance of [
    { directory: env.FINDIT_ISOLATED_DATADIR, port: 3306 },
    { directory: env.FINDIT_ISOLATED_DATADIR, port: 3311 },
    { directory: env.FINDIT_ISOLATED_DATADIR, port: 45001 },
    { directory: join(tmpdir(), 'findit-mysql-other', 'data'), port: 45000 },
    { directory: env.FINDIT_ISOLATED_DATADIR, port: 45000 }
  ]) {
    let closed = false;
    const open = async (config, selectDatabase) => {
      assert.equal(config.port, 45000);
      assert.equal(selectDatabase, false);
      return { async query(sql) { assert.equal(sql, 'SELECT @@datadir AS directory, @@port AS port'); return [[instance]]; }, async end() { closed = true; } };
    };
    if (instance.port === 45000 && instance.directory === env.FINDIT_ISOLATED_DATADIR) await assertIsolatedInstance(env, open);
    else await assert.rejects(() => assertIsolatedInstance(env, open), /identity mismatch/);
    assert.equal(closed, true);
  }
});
