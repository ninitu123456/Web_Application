import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { serve } from './helpers.js';
import { createTokenService, issuer, audience } from '../utils/jwt.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { validateRegister, validateFullName } from '../validation/auth.validation.js';
import { readSecurityConfig, readConfig } from '../config/env.js';
import { createErrorHandler } from '../middleware/error-handler.js';
import { HttpError } from '../utils/http-error.js';
import { protectedRoutes, assertNoPrivateData } from './fixtures/security.js';

const healthService = { async check() { return { status: 'ok', database: 'up' }; } };
const secret = randomBytes(32).toString('hex');
const tokens = createTokenService({ secret, expiresIn: 3600 });
function invalidTokens() {
  const sign = (payload, options = {}) => jwt.sign(payload, secret, { algorithm: 'HS256', issuer, audience, expiresIn: 3600, ...options });
  const valid = tokens.sign('1').split('.');
  valid[2] = (valid[2][0] === 'a' ? 'b' : 'a') + valid[2].slice(1);
  const raw = (claims) => {
    const value = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
    return value + '.' + createHmac('sha256', secret).update(value).digest('base64url');
  };
  const claims = { sub: '1', iss: issuer, aud: audience, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) };
  return [raw({ ...claims, exp: 'tomorrow' }), raw({ ...claims, iat: 'yesterday' }), raw({ ...claims, sub: 1 }),
    'broken', valid.join('.'), jwt.sign({ sub: '1' }, '', { algorithm: 'none' }),
    sign({ sub: '1', nbf: Math.floor(Date.now() / 1000) + 3600 }),
    sign({ sub: '1' }, { expiresIn: -1 }), sign({}), sign({ sub: '01' }), sign({ sub: '-1' }),
    sign({ sub: '18446744073709551616' }), sign({ sub: '1' }, { noTimestamp: true }),
    jwt.sign({ sub: '1', iat: 1, iss: issuer, aud: audience }, secret),
    sign({ sub: '1' }, { audience: 'wrong' }), sign({ sub: '1' }, { issuer: 'wrong' }),
    sign({ sub: '1' }, { algorithm: 'HS512' })];
}

test('every protected route rejects anonymous/invalid/expired JWT and suspended users before services', async () => {
  let serviceCalls = 0;
  const unexpected = new Proxy({}, { get() { return async () => { serviceCalls++; throw new Error('Forbidden service call'); }; } });
  const repository = { async findById(id) { return { user_id: id, full_name: 'A', email: 'a@test.invalid', role: 'USER', account_status: 'SUSPENDED' }; } };
  const authService = createAuthService(repository, tokens);
  const http = await serve({ healthService, authService, userService: unexpected, itemService: unexpected, matchingService: unexpected,
    claimService: unexpected, notificationService: unexpected, reportService: unexpected, adminService: unexpected, security: { apiMax: 1000 } });
  try {
    for (const [method, path, body] of protectedRoutes) {
      for (const [authorization, expected] of [[undefined, 401], ['Bearer broken', 401], [`Bearer ${tokens.sign('1')}`, 403]]) {
        const headers = { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) };
        const res = await fetch(http.url + '/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
        assert.equal(res.status, expected, `${method} ${path}`);
        assertNoPrivateData(assert, await res.json());
      }
    }
    for (const token of invalidTokens()) assert.equal((await fetch(http.url + '/api/users/me', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    for (const value of ['Basic abc', 'Bearer', 'Bearer a b']) assert.equal((await fetch(http.url + '/api/users/me', { headers: { Authorization: value } })).status, 401);
    assert.equal(serviceCalls, 0);
    assert.equal(tokens.verify(tokens.sign('18446744073709551615')), '18446744073709551615');
    const missing = createAuthService({ async findById() {} }, tokens);
    await assert.rejects(() => missing.authenticate(tokens.sign('1')), (e) => e.status === 401);
  } finally { await http.close(); }
});

test('every Admin method denies USER before validation; headers cover success, errors and preflight', async () => {
  let calls = 0;
  const denied = new Proxy({}, { get() { return async () => { calls++; }; } });
  const http = await serve({ healthService, authService: { async authenticate() { return { id: '1', role: 'USER' }; } }, userService: {}, adminService: denied, reportService: denied });
  try {
    for (const [method, path, body] of protectedRoutes.filter((r) => r[1].startsWith('/admin/'))) {
      const res = await fetch(http.url + '/api' + path, { method, headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    }
    for (const path of ['/api/health', '/api/absent', '/api/users/me']) {
      const res = await fetch(http.url + path);
      assert.equal(res.headers.get('x-powered-by'), null);
      assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.equal(res.headers.get('strict-transport-security'), null);
      assert.ok(!res.headers.get('content-security-policy').includes('upgrade-insecure-requests'));
    }
    assert.equal(calls, 0);
    for (const origin of ['http://localhost:5173', 'http://localhost:5173.evil.invalid', 'null', undefined]) {
      const res = await fetch(http.url + '/api/health', { headers: origin ? { Origin: origin } : {} });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), origin === 'http://localhost:5173' ? origin : null);
      assert.equal(res.headers.get('access-control-allow-credentials'), null);
    }
    const preflight = await fetch(http.url + '/api/items', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('x-content-type-options'), 'nosniff');
  } finally { await http.close(); }
  const prod = await serve({ healthService, security: { production: true } });
  try { const res = await fetch(prod.url + '/api/health'); assert.match(res.headers.get('strict-transport-security'), /max-age=/); assert.match(res.headers.get('content-security-policy'), /upgrade-insecure-requests/); }
  finally { await prod.close(); }
});

// No timers or sleeps: a test-owned clock advances the limiter's store deterministically.
class ClockStore {
  localKeys = true; now = 0; entries = new Map();
  init({ windowMs }) { this.windowMs = windowMs; }
  async increment(key) {
    let entry = this.entries.get(key);
    if (!entry || entry.until <= this.now) { entry = { hits: 0, until: this.now + this.windowMs }; this.entries.set(key, entry); }
    return { totalHits: ++entry.hits, resetTime: new Date(Date.now() + entry.until - this.now) };
  }
  async decrement(key) { const value = this.entries.get(key); if (value) value.hits--; }
  async resetKey(key) { this.entries.delete(key); }
}

test('API limiter counts concurrent requests, ignores spoofed IP, resets window and isolates apps', async () => {
  const store = new ClockStore(); let checks = 0;
  const options = { healthService, authService: { async authenticate() { checks++; return { id: '1', role: 'USER' }; } }, userService: { getMe() { return {}; } }, security: { api: { limit: 2, windowMs: 1000, store } } };
  const http = await serve(options), other = await serve({ ...options, security: { apiMax: 2 } });
  try {
    const requests = await Promise.all(Array.from({ length: 4 }, (_, i) => fetch(http.url + '/api/users/me', { headers: { Authorization: 'Bearer valid', 'X-Forwarded-For': `192.0.2.${i + 1}` } })));
    assert.deepEqual(requests.map((r) => r.status).sort(), [200, 200, 429, 429]);
    const blocked = requests.find((r) => r.status === 429); assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await blocked.json()).success, false); assert.equal(blocked.headers.get('cache-control'), 'no-store');
    assert.equal(checks, 2);
    assert.equal((await fetch(http.url + '/api/health')).status, 200);
    assert.equal((await fetch(http.url + '/api/items', { method: 'OPTIONS' })).status, 204);
    assert.equal((await fetch(other.url + '/api/users/me', { headers: { Authorization: 'Bearer valid' } })).status, 200);
    store.now = 1000;
    assert.equal((await fetch(http.url + '/api/users/me', { headers: { Authorization: 'Bearer valid' } })).status, 200);
  } finally { await http.close(); await other.close(); }
});

test('login/register limiter rejects before service work and counts successful and unsuccessful requests', async () => {
  let calls = 0;
  const http = await serve({ healthService, userService: {}, security: { loginMax: 1, registerMax: 1 }, authService: {
    async login() { calls++; throw new HttpError(401, 'Invalid credentials'); }, async register() { calls++; return { id: 1 }; }
  } });
  try {
    for (const [route, body, status] of [['login', { email: 'a@b.test', password: '12345678' }, 401], ['register', { email: 'a@b.test', password: '12345678', fullName: 'A' }, 201]]) {
      const send = () => fetch(http.url + '/api/auth/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal((await send()).status, status); assert.equal((await send()).status, 429);
    }
    assert.equal(calls, 2);
  } finally { await http.close(); }
});

test('upload limiter is per authenticated user including ADMIN and runs before multipart parsing', async () => {
  let calls = 0;
  const http = await serve({ healthService, security: { uploadMax: 1 }, authService: { async authenticate(id) { return { id, role: id === 'admin' ? 'ADMIN' : 'USER' }; } }, userService: {}, itemService: { async uploadImages() { calls++; return []; } } });
  try {
    const send = (id) => fetch(http.url + '/api/items/1/images', { method: 'POST', headers: { ...(id ? { Authorization: `Bearer ${id}` } : {}), 'Content-Type': 'multipart/form-data' }, body: 'invalid' });
    assert.equal((await send()).status, 401);
    for (const id of ['user', 'admin']) { assert.equal((await send(id)).status, 400); assert.equal((await send(id)).status, 429); }
    assert.equal(calls, 0);
  } finally { await http.close(); }
});

test('multipart rejects unexpected fields/files/framing and accepts exactly five file parts', async () => {
  let calls = 0;
  const http = await serve({ healthService, security: { uploadMax: 50 }, authService: { async authenticate() { return { id: '1', role: 'USER' }; } }, userService: {}, itemService: { async uploadImages(_identity, _id, files) { calls++; return files.map((f) => ({ name: f.originalname })); } } });
  try {
    const send = (body, contentType) => fetch(http.url + '/api/items/1/images', { method: 'POST', headers: { Authorization: 'Bearer valid', ...(contentType ? { 'Content-Type': contentType } : {}) }, body });
    for (const [field, count, expected] of [['images', 5, 201], ['images', 6, 400], ['file', 1, 400]]) {
      const form = new FormData(); for (let i = 0; i < count; i++) form.append(field, new Blob(['image'], { type: 'image/png' }), '../../odd.png');
      assert.equal((await send(form)).status, expected);
    }
    const fields = new FormData(); fields.append('userId', '2'); assert.equal((await send(fields)).status, 400);
    assert.equal((await send('broken', 'multipart/form-data')).status, 400);
    assert.equal((await send('--abc\r\n', 'multipart/form-data; boundary=abc')).status, 400);
    assert.equal(calls, 1);
  } finally { await http.close(); }
  for (const [code, expected] of [['LIMIT_FIELD_VALUE', 413], ['LIMIT_FIELD_KEY', 400], ['LIMIT_PART_COUNT', 400], ['INTERNAL', 500]]) {
    let status; const res = { headersSent: false, status(value) { status = value; return this; }, json(value) { assert.equal(value.success, false); } };
    createErrorHandler(() => {})(Object.assign(new Error('private failure'), { code }), {}, res, () => {});
    assert.equal(status, expected);
  }
});

test('Unicode boundaries, profile disappearance and security config fail safely', async () => {
  const input = { fullName: '😀'.repeat(150), email: 'a@b.test', password: 'đ'.repeat(36) };
  assert.equal(validateRegister(input).password, input.password);
  assert.throws(() => validateFullName('😀'.repeat(151)), (e) => e.status === 400);
  assert.throws(() => validateRegister({ ...input, password: 'đ'.repeat(37) }), (e) => e.status === 400);
  for (const updated of [0, 1]) {
    const service = createUserService({ async updateFullName() { return updated; }, async findById() {} });
    await assert.rejects(() => service.updateMe({ id: '1' }, { fullName: 'Changed' }), (e) => e.status === 404);
  }
  for (const value of ['0', '-1', '1.5', 'NaN']) assert.throws(() => readSecurityConfig({ RATE_LIMIT_API_MAX: value }));
  assert.equal(readSecurityConfig({}).apiMax, 300);
  assert.equal(readSecurityConfig({ NODE_ENV: 'production' }).production, true);
  assert.equal(readConfig({ DB_USER: 'test', DB_PASSWORD: '', JWT_SECRET: secret, NODE_ENV: 'development' }).aiVisual.enabled, false);
  assert.throws(() => readConfig({ DB_USER: 'test', DB_PASSWORD: '', JWT_SECRET: secret, NODE_ENV: 'production', AI_VISUAL_MATCHING_ENABLED: 'true' }),
    (e) => e.code === 'INVALID_CONFIG' && /development or test/.test(e.message));
  assert.throws(() => readConfig({ DB_USER: 'test', DB_PASSWORD: '', JWT_SECRET: secret, RATE_LIMIT_API_MAX: '0' }), (e) => e.code === 'INVALID_CONFIG' && /RATE_LIMIT_API_MAX/.test(e.message));
});
