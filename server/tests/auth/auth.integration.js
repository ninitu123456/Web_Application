import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { configFromEnv } from '../../../database/scripts/config.js';
import { connect } from '../../../database/scripts/connection.js';
import { migrate } from '../../../database/scripts/migrate.js';
import { quote, tables } from '../../../database/schema.js';
import { createDbPool, query } from '../../config/db.js';
import { createApp } from '../../app.js';
import { createUserRepository } from '../../repositories/user.repository.js';
import { createHealthRepository } from '../../repositories/health.repository.js';
import { createHealthService } from '../../services/health.service.js';
import { createAuthService } from '../../services/auth.service.js';
import { createUserService } from '../../services/user.service.js';
import { createTokenService, issuer, audience } from '../../utils/jwt.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeRoles } from '../../middleware/authorize-roles.js';
import { createErrorHandler } from '../../middleware/error-handler.js';
import { serveApp, request } from './helpers.js';

function assertOwnedDatabase(name, ownedName) {
  if (name === 'findit_db' || name !== ownedName || !/^findit_test_[a-f0-9]{24}$/.test(name)) throw new Error('Refusing unowned database cleanup');
}
function assertPublicProfile(user) {
  assert.deepEqual(Object.keys(user).sort(), ['email', 'fullName', 'id', 'role']);
  assert.equal(Number.isSafeInteger(user.id), true);
}
async function mainDataDigest(config) {
  const pool = createDbPool(config);
  const digest = createHash('sha256');
  try {
    for (const table of tables) {
      const [rows] = await query(pool, `SELECT * FROM ${quote(table.name)} ORDER BY ${quote(table.pk)}`);
      digest.update(JSON.stringify(rows));
    }
    return digest.digest('hex');
  } finally { await pool.end(); }
}

test('Auth/User integration: real HTTP and MySQL, all writes isolated from findit_db', { timeout: 120000 }, async (t) => {
  const base = configFromEnv();
  const before = await mainDataDigest(base);
  const ownedName = `findit_test_${randomBytes(12).toString('hex')}`;
  const connection = await connect(base, false);
  const secret = randomBytes(32).toString('hex');
  const tokens = createTokenService({ secret, expiresIn: 3600 });
  const password = randomBytes(18).toString('hex');
  const input = { fullName: 'Nguyễn Test', email: 'auth-user@example.test', password };
  let created = false, pool, http, adminHttp, userId, token;
  try {
    await connection.query(`CREATE DATABASE ${quote(ownedName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await connection.query(`USE ${quote(ownedName)}`);
    await migrate(connection, ownedName);
    // Deliberately nonstandard role IDs prove registration resolves USER by name.
    await connection.query("INSERT INTO roles (role_id, name) VALUES (37, 'ADMIN'), (81, 'USER')");
    pool = createDbPool({ ...base, database: ownedName });
    const repository = createUserRepository(pool);
    const authService = createAuthService(repository, tokens);
    http = await serveApp(createApp({
      healthService: createHealthService(createHealthRepository(pool)),
      authService, userService: createUserService(repository), logger: () => {}
    }));
    // This endpoint is mounted only in a separate test app, never in production.
    const adminApp = express();
    adminApp.get('/admin-check', authenticate(authService), authorizeRoles('ADMIN'), (req, res) => res.json({ success: true }));
    adminApp.use(createErrorHandler(() => {}));
    adminHttp = await serveApp(adminApp);

    await t.test('register 201 persists USER and a valid cost-12 bcrypt hash without leaking private fields', async () => {
      const response = await request(http, '/api/auth/register', { method: 'POST', body: { ...input, fullName: ' Nguyễn Test ', email: ' AUTH-USER@EXAMPLE.TEST ' } });
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assertPublicProfile(response.json.data);
      assert.equal(response.json.data.role, 'USER');
      assert.equal(response.json.data.email, input.email);
      userId = response.json.data.id;
      const [[user]] = await query(pool, 'SELECT role_id, password_hash, account_status FROM users WHERE user_id=?', [userId]);
      assert.equal(String(user.role_id), '81');
      assert.equal(user.account_status, 'ACTIVE');
      assert.notEqual(user.password_hash, password);
      assert.equal(bcrypt.getRounds(user.password_hash), 12);
      assert.equal(await bcrypt.compare(password, user.password_hash), true);
    });
    await t.test('duplicate email is 409 and simultaneous registrations create only one account', async () => {
      assert.equal((await request(http, '/api/auth/register', { method: 'POST', body: input })).status, 409);
      const duplicate = { ...input, email: 'concurrent@example.test' };
      const responses = await Promise.all([1, 2].map(() => request(http, '/api/auth/register', { method: 'POST', body: duplicate })));
      assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
      const [[count]] = await query(pool, 'SELECT COUNT(*) AS total FROM users WHERE email=?', [duplicate.email]);
      assert.equal(Number(count.total), 1);
    });
    await t.test('invalid input, privilege injection and oversized UTF-8 passwords are 400', async () => {
      for (const body of [null, [], {}, 'scalar', { ...input, role: 'ADMIN' }, { ...input, roleId: 37 },
        { ...input, accountStatus: 'ACTIVE' }, { ...input, email: 'bad' }, { ...input, fullName: ' ' },
        { ...input, password: 'short' }, { ...input, password: 'đ'.repeat(37) }]) {
        assert.equal((await request(http, '/api/auth/register', { method: 'POST', body })).status, 400);
      }
    });
    await t.test('login 200 issues a usable JWT; wrong passwords and unknown emails share 401', async () => {
      const response = await request(http, '/api/auth/login', { method: 'POST', body: { email: input.email, password } });
      assert.equal(response.status, 200);
      assertPublicProfile(response.json.data.user);
      token = response.json.data.token;
      assert.equal(tokens.verify(token), String(userId));
      const wrong = await request(http, '/api/auth/login', { method: 'POST', body: { email: input.email, password: 'wrong' } });
      const absent = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'absent@example.test', password } });
      const injection = await request(http, '/api/auth/login', { method: 'POST', body: { email: "a'OR'1'='1@example.test", password } });
      assert.equal(wrong.status, 401); assert.equal(absent.status, 401); assert.equal(injection.status, 401);
      assert.deepEqual(wrong.json, absent.json);
    });
    await t.test('protected requests reject missing, malformed, expired and incorrectly signed JWTs', async () => {
      assert.equal((await request(http, '/api/users/me')).status, 401);
      const options = { algorithm: 'HS256', issuer, audience, expiresIn: 3600 };
      for (const invalid of [
        'invalid', jwt.sign({ sub: String(userId) }, randomBytes(32).toString('hex'), options),
        jwt.sign({ sub: String(userId) }, secret, { ...options, expiresIn: -1 }),
        jwt.sign({ sub: String(userId) }, secret, { ...options, algorithm: 'HS384' }),
        jwt.sign({ sub: String(userId) }, secret, { ...options, audience: 'wrong-client' }),
        tokens.sign('999999999'), jwt.sign({ sub: String(userId) }, secret, { algorithm: 'HS256', issuer, audience })
      ]) assert.equal((await request(http, '/api/users/me', { token: invalid })).status, 401);
    });
    await t.test('GET/PATCH me return only public fields and cannot modify another user or role', async () => {
      const profile = await request(http, '/api/users/me', { token });
      assert.equal(profile.status, 200); assertPublicProfile(profile.json.data);
      const other = await request(http, '/api/auth/register', { method: 'POST', body: { ...input, email: 'other@example.test' } });
      for (const body of [{ fullName: 'Changed', userId: other.json.data.id }, { fullName: 'Changed', role: 'ADMIN' }, { email: 'change@example.test' }]) {
        assert.equal((await request(http, '/api/users/me', { method: 'PATCH', token, body })).status, 400);
      }
      const updated = await request(http, '/api/users/me', { method: 'PATCH', token, body: { fullName: '  Tên mới  ' } });
      assert.equal(updated.status, 200); assert.equal(updated.json.data.fullName, 'Tên mới'); assertPublicProfile(updated.json.data);
      // Same-value updates must be successful as well.
      assert.equal((await request(http, '/api/users/me', { method: 'PATCH', token, body: { fullName: 'Tên mới' } })).status, 200);
      const [[untouched]] = await query(pool, 'SELECT full_name FROM users WHERE user_id=?', [other.json.data.id]);
      assert.equal(untouched.full_name, input.fullName);
    });
    await t.test('USER is denied ADMIN access and the same token observes current roles immediately', async () => {
      assert.equal((await request(adminHttp, '/admin-check')).status, 401);
      assert.equal((await request(adminHttp, '/admin-check', { token })).status, 403);
      await query(pool, 'UPDATE users SET role_id=37 WHERE user_id=?', [userId]);
      assert.equal((await request(adminHttp, '/admin-check', { token })).status, 200);
      const profile = await request(http, '/api/users/me', { token });
      assert.equal(profile.status, 200); assert.equal(profile.json.data.role, 'ADMIN');
      const adminLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: input.email, password } });
      assert.equal(adminLogin.status, 200); assert.equal(adminLogin.json.data.user.role, 'ADMIN');
      await query(pool, 'UPDATE users SET role_id=81 WHERE user_id=?', [userId]);
      assert.equal((await request(adminHttp, '/admin-check', { token })).status, 403);
      assert.equal((await request(http, '/api/admin-check', { token })).status, 404);
    });
    await t.test('SUSPENDED users cannot log in or use existing tokens; restoring ACTIVE restores access', async () => {
      await query(pool, "UPDATE users SET account_status='SUSPENDED' WHERE user_id=?", [userId]);
      assert.equal((await request(http, '/api/auth/login', { method: 'POST', body: { email: input.email, password } })).status, 401);
      assert.equal((await request(http, '/api/users/me', { token })).status, 403);
      await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [userId]);
      assert.equal((await request(http, '/api/users/me', { token })).status, 200);
    });
    await t.test('test cleanup refuses main database and unowned names', () => {
      assert.throws(() => assertOwnedDatabase('findit_db', ownedName), /Refusing/);
      assert.throws(() => assertOwnedDatabase('findit_test_' + '0'.repeat(24), ownedName), /Refusing/);
    });
  } finally {
    try {
      if (http) await http.close();
      if (adminHttp) await adminHttp.close();
      if (pool) await pool.end();
      if (created) { assertOwnedDatabase(ownedName, ownedName); await connection.query(`DROP DATABASE ${quote(ownedName)}`); }
    } finally { await connection.end(); }
    assert.equal(await mainDataDigest(base), before, 'findit_db must remain byte-for-byte unchanged');
  }
});
