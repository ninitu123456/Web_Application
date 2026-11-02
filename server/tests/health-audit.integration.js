import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { configFromEnv } from '../../database/scripts/config.js';
import { createDbPool, query } from '../config/db.js';
import { createHealthRepository } from '../repositories/health.repository.js';
import { createHealthService } from '../services/health.service.js';

test('F08: real saturated pool keeps one pending health acquisition, releases late session and recovers', { timeout: 15000 }, async () => {
  const pool = createDbPool();
  const held = [];
  try {
    for (let i = 0; i < 10; i++) held.push(await pool.getConnection());
    let acquisitions = 0, statements = 0;
    const wrapper = { getConnection() { acquisitions++; return pool.getConnection().then((real) => new Proxy(real, { get(target, key) {
      if (key === 'query') return (...args) => { statements++; return target.query(...args); };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } })); } };
    const repository = createHealthRepository(wrapper);
    const start = performance.now();
    await assert.rejects(repository.checkConnection(), { code: 'HEALTH_PROBE_TIMEOUT' });
    assert.ok(performance.now() - start >= 900 && performance.now() - start < 2500);
    for (let i = 0; i < 20; i++) await assert.rejects(repository.checkConnection());
    assert.equal(acquisitions, 1);
    held.pop().release(); await delay(30);
    assert.equal(statements, 0);
    assert.equal(Number((await repository.checkConnection()).ok), 1);
    assert.equal(acquisitions, 2);
    const [[row]] = await query(pool, 'SELECT 1 AS ok'); assert.equal(Number(row.ok), 1);
  } finally { for (const connection of held) connection.release(); await pool.end(); }
});

for (const phase of ['setup', 'select']) test(`F08: real ${phase} response blackhole meets 1s deadline and destroys once`, { timeout: 15000 }, async () => {
  const base = configFromEnv(), sockets = new Set(); let drop = false;
  const proxy = net.createServer((client) => {
    const upstream = net.connect(base.port, '127.0.0.1'); sockets.add(client); sockets.add(upstream);
    client.on('error', () => {}); upstream.on('error', () => {}); client.pipe(upstream);
    upstream.on('data', (chunk) => { if (!drop) client.write(chunk); });
    client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const pool = createDbPool({ ...base, port: proxy.address().port });
  let destroyed = 0, released = 0, statements = 0;
  const wrapper = { async getConnection() {
    const real = await pool.getConnection();
    return new Proxy(real, { get(target, key) {
      if (key === 'query') return (...args) => { statements++; if (statements === (phase === 'setup' ? 1 : 2)) drop = true; return target.query(...args); };
      if (key === 'destroy') return () => { destroyed++; target.destroy(); };
      if (key === 'release') return () => { released++; target.release(); };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  try {
    const service = createHealthService(createHealthRepository(wrapper));
    const start = performance.now();
    await assert.rejects(service.check(), { status: 503 });
    assert.ok(performance.now() - start >= 900 && performance.now() - start < 2500);
    await delay(30);
    assert.equal(destroyed, 1); assert.equal(released, 0);
    assert.equal(statements, phase === 'setup' ? 1 : 2);
  } finally {
    for (const socket of sockets) socket.destroy();
    await pool.end(); await new Promise((resolve) => proxy.close(resolve));
  }
});
