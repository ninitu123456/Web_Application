import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createHealthService } from '../services/health.service.js';
import { createHealthRepository } from '../repositories/health.repository.js';
import { serve } from './helpers.js';
import { readHealthConfig, readSecurityConfig } from '../config/env.js';

test('F08: health configuration has explicit safe defaults and rejects invalid timer/limit values', () => {
  assert.deepEqual(readHealthConfig({}), { timeoutMs: 1000 });
  assert.equal(readSecurityConfig({}).healthMax, 60);
  for (const value of ['0', '-1', 'NaN', '1.5', '2147483648']) assert.throws(() => readHealthConfig({ HEALTH_PROBE_TIMEOUT_MS: value }));
  assert.throws(() => readSecurityConfig({ RATE_LIMIT_HEALTH_MAX: '0' }));
});

test('F08: readiness has a separate IP quota before probing, including HEAD and route variants', async () => {
  let calls = 0;
  const http = await serve({ healthService: { async check() { calls++; return {}; } }, security: { healthMax: 2 } });
  try {
    assert.equal((await fetch(http.url + '/api/health')).status, 200);
    assert.equal((await fetch(http.url + '/api/HEALTH/', { method: 'HEAD' })).status, 200);
    const blocked = await fetch(http.url + '/api/health', { headers: { 'X-Forwarded-For': '192.0.2.1' } });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal(blocked.headers.get('cache-control'), 'no-store');
    assert.equal(calls, 2);
    assert.equal((await fetch(http.url + '/api/health', { method: 'OPTIONS' })).status, 204);
  } finally { await http.close(); }
});

test('F08: concurrent checks share a probe and success/failure caches expire independently', async () => {
  let calls = 0, now = 0, fail = false;
  const service = createHealthService({ async checkConnection() {
    calls++; await delay(5);
    if (fail) throw new Error('password=private');
    return { ok: 1, database_name: 'findit_db' };
  } }, { now: () => now });
  await Promise.all(Array.from({ length: 30 }, () => service.check()));
  assert.equal(calls, 1);
  now = 1999; await service.check(); assert.equal(calls, 1);
  now = 2000; fail = true;
  await assert.rejects(service.check(), { status: 503 }); assert.equal(calls, 2);
  now = 2999; fail = false;
  await assert.rejects(service.check(), { status: 503 }); assert.equal(calls, 2);
  now = 3000; await service.check(); assert.equal(calls, 3);
  await service.check({ fresh: true }); assert.equal(calls, 4);
});

test('F08: timed-out acquisition stays admitted until settled and never dispatches late SQL', async () => {
  let resolve, acquisitions = 0, queries = 0, releases = 0;
  const pool = { getConnection() { acquisitions++; return new Promise((done) => { resolve = done; }); } };
  const repository = createHealthRepository(pool, { timeoutMs: 25 });
  await assert.rejects(repository.checkConnection(), { code: 'HEALTH_PROBE_TIMEOUT' });
  for (let i = 0; i < 5; i++) await assert.rejects(repository.checkConnection());
  assert.equal(acquisitions, 1);
  resolve({ query() { queries++; }, release() { releases++; } });
  await delay(5);
  assert.equal(queries, 0); assert.equal(releases, 1);
});

test('F08: setup/query deadline destroys once and late success cannot become readiness success', async () => {
  for (const stalled of ['setup', 'select']) {
    let resolve, queries = 0, destroyed = 0, released = 0;
    const connection = {
      query() { queries++; return (stalled === 'setup' || queries === 2) ? new Promise((done) => { resolve = done; }) : Promise.resolve([[]]); },
      destroy() { destroyed++; }, release() { released++; }
    };
    const repo = createHealthRepository({ async getConnection() { return connection; } }, { timeoutMs: 25 });
    await assert.rejects(repo.checkConnection(), { code: 'HEALTH_PROBE_TIMEOUT' });
    assert.equal(destroyed, 1);
    resolve([[{ ok: 1, database_name: 'findit_db' }]]); await delay(5);
    assert.equal(queries, stalled === 'setup' ? 1 : 2);
    assert.equal(released, 0); assert.equal(destroyed, 1);
  }
});
