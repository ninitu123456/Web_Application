import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers.js';
import { readAppConfig } from '../config/env.js';
import { createHealthService } from '../services/health.service.js';
import { logError } from '../utils/logger.js';

const healthy = { async check() { return { status: 'ok', database: 'up' }; } };
const expectedSuccess = { success: true, message: 'Hệ thống hoạt động bình thường', data: { status: 'ok', database: 'up' } };

test('app config has agreed defaults and rejects invalid ports/origins', () => {
  assert.deepEqual(readAppConfig({}), { host: '127.0.0.1', port: 3001, corsOrigins: ['http://localhost:5173', 'http://localhost:3000'] });
  for (const port of ['0', '-1', '65536', 'invalid', '']) assert.throws(() => readAppConfig({ PORT: port }), /PORT/);
  for (const origin of ['*', 'https://example.test/path', 'https://u:p@example.test', '', 'file:///tmp']) {
    assert.throws(() => readAppConfig({ CORS_ORIGINS: origin }), /CORS_ORIGINS/);
  }
  assert.deepEqual(readAppConfig({ CORS_ORIGINS: 'https://example.test, https://example.test' }).corsOrigins, ['https://example.test']);
});

test('health probes every request, disables caching, returns 503 then recovers', async () => {
  let calls = 0, fail = false;
  const service = createHealthService({ async checkConnection() {
    calls++;
    if (fail) throw Object.assign(new Error('SQL with password=secret'), { code: 'ECONNREFUSED' });
    return { ok: 1, database_name: 'findit_db' };
  } });
  const http = await serve({ healthService: service });
  try {
    let response = await fetch(`${http.url}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expectedSuccess);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-powered-by'), null);
    fail = true;
    response = await fetch(`${http.url}/api/health`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { success: false, message: 'Cơ sở dữ liệu tạm thời không khả dụng' });
    fail = false;
    response = await fetch(`${http.url}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(calls, 3);
  } finally { await http.close(); }
});

test('wrong selected database cannot produce a successful health response', async () => {
  const service = createHealthService({ async checkConnection() { return { ok: 1, database_name: 'other_database' }; } });
  await assert.rejects(() => service.check(), (error) => error.status === 503);
});

test('unknown routes return contract JSON 404', async () => {
  const http = await serve({ healthService: healthy });
  try {
    for (const route of ['/api/does-not-exist', '/missing', '/api/items']) {
      const response = await fetch(http.url + route);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { success: false, message: 'Không tìm thấy API' });
    }
  } finally { await http.close(); }
});

test('unexpected async errors return sanitized JSON 500', async () => {
  const http = await serve({ healthService: { async check() { throw new Error('password=secret SELECT * FROM users'); } } });
  try {
    const response = await fetch(`${http.url}/api/health`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { success: false, message: 'Lỗi máy chủ nội bộ' });
  } finally { await http.close(); }
});

test('malformed and oversized JSON return 400 and 413', async () => {
  const http = await serve({ healthService: healthy });
  try {
    const bad = await fetch(`${http.url}/api/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
    assert.equal(bad.status, 400);
    assert.deepEqual(await bad.json(), { success: false, message: 'Dữ liệu JSON không hợp lệ' });
    const large = await fetch(`${http.url}/api/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'a'.repeat(103000) }) });
    assert.equal(large.status, 413);
    assert.deepEqual(await large.json(), { success: false, message: 'Dữ liệu yêu cầu quá lớn' });
  } finally { await http.close(); }
});

test('CORS allows configured origins/preflight without credentials or wildcard', async () => {
  const http = await serve({ healthService: healthy });
  try {
    const response = await fetch(`${http.url}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    const preflight = await fetch(`${http.url}/api/health`, { method: 'OPTIONS', headers: {
      Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization,Content-Type'
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
    const blocked = await fetch(`${http.url}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(`${http.url}/api/health`)).status, 200);
  } finally { await http.close(); }
});

test('safe logger never serializes raw driver errors', (t) => {
  const lines = [];
  t.mock.method(console, 'error', (line) => lines.push(line));
  logError('test_failure', { code: 'ER_ACCESS_DENIED_ERROR', message: 'password=secret', sql: 'SELECT private_data' });
  assert.deepEqual(lines, ['{"event":"test_failure","code":"ER_ACCESS_DENIED_ERROR"}']);
});
