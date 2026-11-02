import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageOperations } from '../services/image-operations.js';

test('F01: bounded admission rejects overload before acquiring another connection', async () => {
  let acquisitions = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pool = { async getConnection() { acquisitions++; return {
    async query(statement) { return statement.sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : statement.sql.includes('RELEASE_LOCK') ? [[{ released: 1 }]] : [[]]; }, release() {}, destroy() {}
  }; } };
  const operations = createImageOperations(pool, {}, () => {}, { concurrency: 1, queueLimit: 0, waitMs: 50 });
  const first = operations.run({ itemId: 1, kind: 'UPLOAD', publicIds: [] }, () => gate);
  await new Promise((resolve) => setImmediate(resolve));
  try {
    await assert.rejects(() => operations.run({ itemId: 2, kind: 'UPLOAD', publicIds: [] }, async () => {}), (e) => e.status === 503);
    assert.equal(acquisitions, 1);
  } finally { release(); await first; }
});


test('F01: queued admission expires without acquiring SQL and capacity recovers', async () => {
  let acquisitions = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pool = { async getConnection() { acquisitions++; return {
    async query(statement) { return statement.sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : statement.sql.includes('RELEASE_LOCK') ? [[{ released: 1 }]] : [[]]; }, release() {}, destroy() {}
  }; } };
  const operations = createImageOperations(pool, {}, () => {}, { concurrency: 1, queueLimit: 1, waitMs: 20 });
  const first = operations.run({ itemId: 1, kind: 'UPLOAD', publicIds: [] }, () => gate);
  await new Promise((resolve) => setImmediate(resolve));
  try {
    await assert.rejects(() => operations.run({ itemId: 2, kind: 'UPLOAD', publicIds: [] }, async () => {}), (e) => e.status === 503);
    assert.equal(acquisitions, 1);
  } finally { release(); await first; }
  await operations.run({ itemId: 3, kind: 'UPLOAD', publicIds: [] }, async () => {});
  assert.equal(acquisitions, 2);
});
