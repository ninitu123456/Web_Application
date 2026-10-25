import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createDbPool, query } from '../config/db.js';
import { readConfig } from '../config/env.js';
import { createHealthRepository } from '../repositories/health.repository.js';
import { createHealthService } from '../services/health.service.js';
import { startServer } from '../server.js';
import { serve } from './helpers.js';
import { randomBytes } from 'node:crypto';

// Tests must not depend on, overwrite, or disclose the application's JWT secret.
const testSecret = randomBytes(32).toString('hex');
const testConfig = () => readConfig({ ...process.env, JWT_SECRET: testSecret, JWT_EXPIRES_IN: '3600' });

test('real MySQL pool: health 200, session settings, sample reads, closed pool 503', { timeout: 20000 }, async () => {
  const pool = createDbPool(testConfig().database);
  const http = await serve({ healthService: createHealthService(createHealthRepository(pool)) });
  let poolClosed = false;
  try {
    const response = await fetch(`${http.url}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { status: 'ok', database: 'up' });
    const [[session]] = await query(pool, 'SELECT @@session.time_zone AS tz, @@session.sql_mode AS mode');
    assert.equal(session.tz, '+00:00');
    assert.match(session.mode, /STRICT_ALL_TABLES/);
    const [roles] = await query(pool, 'SELECT name FROM roles ORDER BY name');
    assert.deepEqual(roles.map((row) => row.name), ['ADMIN', 'USER']);
    const [[sample]] = await query(pool, 'SELECT COUNT(*) AS total FROM categories');
    assert.ok(Number(sample.total) >= 4);
    await pool.end();
    poolClosed = true;
    const unavailable = await fetch(`${http.url}/api/health`);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { success: false, message: 'Cơ sở dữ liệu tạm thời không khả dụng' });
  } finally { await http.close(); if (!poolClosed) await pool.end(); }
});

test('startup verifies MySQL, serves HTTP, and closes HTTP/pool cleanly', { timeout: 20000 }, async () => {
  const runtime = await startServer({ ...testConfig(), host: '127.0.0.1', port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${runtime.server.address().port}/api/health`);
    assert.equal(response.status, 200);
  } finally { await runtime.close(); }
  assert.equal(runtime.server.listening, false);
  await assert.rejects(() => runtime.pool.getConnection());
});

test('occupied HTTP port causes startup failure and closes its own pool', { timeout: 20000 }, async () => {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  try {
    await assert.rejects(() => startServer({ ...testConfig(), host: '127.0.0.1', port: listener.address().port }), (error) => error.code === 'EADDRINUSE');
    assert.equal(listener.listening, true);
  } finally { await new Promise((resolve) => listener.close(resolve)); }
});

test('unreachable MySQL fails startup without opening HTTP or leaking secrets', { timeout: 20000 }, async () => {
  const temporary = createServer();
  await new Promise((resolve) => temporary.listen(0, '127.0.0.1', resolve));
  const port = temporary.address().port;
  await new Promise((resolve) => temporary.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server.js', import.meta.url))], {
    windowsHide: true, env: { ...process.env, JWT_SECRET: testSecret, JWT_EXPIRES_IN: '3600', DB_HOST: '127.0.0.1', DB_PORT: String(port), PORT: '3001' },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.equal(code, 1);
  assert.match(output, /startup_failed/);
  assert.match(output, /ECONNREFUSED|DB_ACQUIRE_TIMEOUT|ETIMEDOUT/);
  assert.doesNotMatch(output, /listening|password|SELECT|DB_PASSWORD/);
});
