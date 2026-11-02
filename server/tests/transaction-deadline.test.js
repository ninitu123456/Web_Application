import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { inTransaction, withConnection } from '../config/db.js';

for (const boundary of ['beginTransaction', 'commit', 'rollback']) {
  test(`F02: stalled ${boundary} is bounded and destroys its session`, async () => {
    let destroyed = 0, writes = 0;
    const connection = {
      async beginTransaction() {}, async commit() {}, async rollback() {},
      async query() { writes++; }, destroy() { destroyed++; }
    };
    connection[boundary] = async () => delay(100);
    const started = Date.now();
    await assert.rejects(() => inTransaction(connection, async () => {
      if (boundary === 'rollback') throw new Error('operation failure');
    }, { timeoutMs: 60, boundaryTimeoutMs: 20 }), (error) => {
      assert.equal(error.fatal, true);
      if (boundary === 'commit') assert.equal(error.commitOutcome, 'unknown');
      return true;
    });
    assert.ok(Date.now() - started < 90, 'must not wait for the stalled response');
    assert.equal(destroyed, 1); assert.equal(writes, 0);
  });
}

test('F02: callback resumed after deadline cannot issue a late write or COMMIT', async () => {
  let writes = 0, commits = 0, destroyed = 0, lateError;
  const connection = { async beginTransaction() {}, async commit() { commits++; }, async rollback() {},
    async query() { writes++; }, destroy() { destroyed++; } };
  await assert.rejects(() => inTransaction(connection, async (scoped) => {
    await delay(60);
    try { await scoped.query('INSERT late'); } catch (error) { lateError = error; throw error; }
  }, { timeoutMs: 20, boundaryTimeoutMs: 20 }), (e) => e.fatal === true);
  await delay(80);
  assert.ok(lateError); assert.equal(writes, 0); assert.equal(commits, 0); assert.equal(destroyed, 1);
});

function holdEventLoop(ms) {
  const until = performance.now() + ms;
  while (performance.now() < until) {}
}

for (const method of ['query', 'execute']) test(`F02 absolute deadline: 10ms deadline / 60ms blocked event loop forbids ${method}`, async () => {
  const calls = { writes: 0, commits: 0, rollbacks: 0, destroys: 0 };
  const connection = {
    async beginTransaction() {}, async [method]() { calls.writes++; },
    async commit() { calls.commits++; }, async rollback() { calls.rollbacks++; }, destroy() { calls.destroys++; }
  };
  const error = await inTransaction(connection, async (scoped) => {
    holdEventLoop(60);
    await scoped[method]('INSERT after deadline');
  }, { timeoutMs: 10, boundaryTimeoutMs: 1000 }).then(() => undefined, (error) => error);
  assert.deepEqual(calls, { writes: 0, commits: 0, rollbacks: 0, destroys: 1 });
  assert.equal(error?.code, 'DB_TRANSACTION_TIMEOUT'); assert.equal(error.fatal, true);
  assert.equal(error.commitOutcome, undefined, 'COMMIT was never dispatched');
});

test('F02 absolute deadline: expires immediately before COMMIT while timer is delayed', async () => {
  const calls = { writes: 0, commits: 0, rollbacks: 0, destroys: 0 };
  const connection = { async beginTransaction() {}, async query() { calls.writes++; },
    async commit() { calls.commits++; }, async rollback() { calls.rollbacks++; }, destroy() { calls.destroys++; } };
  const error = await inTransaction(connection, async (scoped) => {
    await scoped.query('INSERT before deadline'); holdEventLoop(60);
  }, { timeoutMs: 10, boundaryTimeoutMs: 1000 }).then(() => undefined, (error) => error);
  assert.deepEqual(calls, { writes: 1, commits: 0, rollbacks: 0, destroys: 1 });
  assert.equal(error?.code, 'DB_TRANSACTION_TIMEOUT'); assert.equal(error.fatal, true);
  assert.equal(error.commitOutcome, undefined);
});

for (const deadline of ['transaction', 'boundary']) test(`F02 absolute deadline: delayed microtask cannot dispatch BEGIN after ${deadline} deadline`, async () => {
  const calls = { begins: 0, operations: 0, destroys: 0 };
  const connection = { async beginTransaction() { calls.begins++; }, async commit() { assert.fail('late COMMIT'); },
    async rollback() { assert.fail('late ROLLBACK'); }, destroy() { calls.destroys++; } };
  queueMicrotask(() => holdEventLoop(60));
  await assert.rejects(() => inTransaction(connection, async () => { calls.operations++; }, {
    timeoutMs: deadline === 'transaction' ? 10 : 1000, boundaryTimeoutMs: deadline === 'boundary' ? 10 : 1000
  }), (error) => error.code === (deadline === 'transaction' ? 'DB_TRANSACTION_TIMEOUT' : 'DB_TRANSACTION_BOUNDARY_TIMEOUT') && error.fatal === true);
  assert.deepEqual(calls, { begins: 0, operations: 0, destroys: 1 });
});

for (const boundary of ['beginTransaction', 'commit', 'rollback']) test(`F02 absolute deadline: delayed ${boundary} acknowledgement cannot defeat boundary timer`, async () => {
  const calls = { begins: 0, commits: 0, rollbacks: 0, destroys: 0, operations: 0 };
  const connection = { async beginTransaction() { calls.begins++; }, async commit() { calls.commits++; },
    async rollback() { calls.rollbacks++; }, destroy() { calls.destroys++; } };
  const original = connection[boundary];
  connection[boundary] = async () => { await original(); holdEventLoop(60); };
  const error = await inTransaction(connection, async () => {
    calls.operations++;
    if (boundary === 'rollback') throw new Error('operation failure');
  }, { timeoutMs: 1000, boundaryTimeoutMs: 10 }).then(() => undefined, (error) => error);
  assert.equal(error?.code, 'DB_TRANSACTION_BOUNDARY_TIMEOUT'); assert.equal(error.fatal, true);
  assert.equal(error.commitOutcome, boundary === 'commit' ? 'unknown' : undefined);
  assert.deepEqual(calls, { begins: 1, commits: boundary === 'commit' ? 1 : 0,
    rollbacks: boundary === 'rollback' ? 1 : 0, destroys: 1, operations: boundary === 'beginTransaction' ? 0 : 1 });
});

test('F02 absolute deadline: expired scope stays closed and its owner destroys once without release', async () => {
  let destroys = 0, releases = 0, writes = 0, lateError;
  const connection = { async beginTransaction() {}, async query(statement) {
    if (!statement.sql?.startsWith('SET SESSION')) writes++;
  }, async commit() { assert.fail('late COMMIT'); }, async rollback() { assert.fail('late ROLLBACK'); },
    destroy() { destroys++; }, release() { releases++; } };
  await assert.rejects(() => withConnection({ async getConnection() { return connection; } }, (session) =>
    inTransaction(session, async (scoped) => {
      holdEventLoop(60);
      try { await scoped.query('INSERT expired'); } catch (error) { lateError = error; }
      await assert.rejects(async () => scoped.query('INSERT still expired'), (error) => error === lateError);
    }, { timeoutMs: 10, boundaryTimeoutMs: 1000 })), (error) => error === lateError && error.code === 'DB_TRANSACTION_TIMEOUT');
  assert.equal(destroys, 1); assert.equal(releases, 0); assert.equal(writes, 0);
});
