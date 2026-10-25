import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validateRegister, validateLogin, validateProfile } from '../../validation/auth.validation.js';
import { readAuthConfig } from '../../config/env.js';
import { createTokenService, issuer, audience } from '../../utils/jwt.js';
import { userDto } from '../../utils/user-dto.js';
import { createAuthService } from '../../services/auth.service.js';
import { createUserService } from '../../services/user.service.js';
import { createApp } from '../../app.js';
import { serveApp, request } from './helpers.js';

const secret = randomBytes(32).toString('hex');
const tokens = createTokenService({ secret, expiresIn: 3600 });
const registration = { fullName: '  Nguyễn Văn A  ', email: ' A@Example.test ', password: ' sample123 ' };
const publicUser = { user_id: '7', full_name: 'Nguyễn Văn A', email: 'a@example.test', role: 'USER', account_status: 'ACTIVE' };

test('strict validation normalizes name/email and preserves password bytes', () => {
  assert.deepEqual(validateRegister(registration), { fullName: 'Nguyễn Văn A', email: 'a@example.test', password: ' sample123 ' });
  for (const body of [null, [], 'string', 1, {}, { ...registration, role: 'ADMIN' }, { ...registration, fullName: ' ' },
    { ...registration, fullName: 'a'.repeat(151) }, { ...registration, email: 'not-an-email' },
    { ...registration, password: '1234567' }, { ...registration, password: 'đ'.repeat(37) }]) {
    assert.throws(() => validateRegister(body), (error) => error.status === 400);
  }
  assert.equal(validateRegister({ ...registration, password: 'a'.repeat(72) }).password.length, 72);
  assert.equal(validateLogin({ email: 'a@example.test', password: 'x' }).password, 'x');
  assert.throws(() => validateProfile({ fullName: 'Valid', roleId: 2 }), (error) => error.status === 400);
});

test('JWT configuration requires a private secret and integer seconds', () => {
  for (const value of [undefined, '', 'x'.repeat(31)]) assert.throws(() => readAuthConfig({ JWT_SECRET: value }), /JWT_SECRET/);
  for (const expiry of ['', '1h', '0', '-1', '1.5']) assert.throws(() => readAuthConfig({ JWT_SECRET: secret, JWT_EXPIRES_IN: expiry }), /JWT_EXPIRES_IN/);
  assert.equal(readAuthConfig({ JWT_SECRET: secret }).expiresIn, 3600);
});

test('JWT uses exact lifetime and rejects invalid signatures, claims, algorithms and expiry', () => {
  const token = tokens.sign('7');
  assert.equal(tokens.verify(token), '7');
  const decoded = jwt.decode(token);
  assert.deepEqual(Object.keys(decoded).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
  assert.equal(decoded.exp - decoded.iat, 3600);
  const sign = (payload, options = {}) => jwt.sign(payload, secret, { algorithm: 'HS256', issuer, audience, expiresIn: 3600, ...options });
  for (const invalid of [
    'invalid', jwt.sign({ sub: '7' }, randomBytes(32).toString('hex')),
    sign({ sub: '7' }, { algorithm: 'HS384' }), sign({ sub: '7' }, { expiresIn: -1 }),
    sign({ sub: '7' }, { audience: 'wrong-client' }), sign({ sub: '7' }, { issuer: 'wrong-api' }),
    sign({ sub: '0' }), sign({ sub: 7 }), sign({ sub: '18446744073709551616' }),
    jwt.sign({ sub: '7' }, secret, { algorithm: 'HS256', issuer, audience })
  ]) assert.throws(() => tokens.verify(invalid), (error) => error.status === 401);
});

test('DTO has exactly public fields and cannot round BIGINT', () => {
  assert.deepEqual(userDto({ ...publicUser, password_hash: 'private', contact_info: 'private' }),
    { id: 7, fullName: 'Nguyễn Văn A', email: 'a@example.test', role: 'USER' });
  assert.throws(() => userDto({ ...publicUser, user_id: '9007199254740993' }), /safely/);
});

test('registration assigns USER, hashes at cost 12, handles duplicate race and missing role', async () => {
  let inserted;
  const repository = {
    async findByEmail() {}, async findUserRole() { return { role_id: '42' }; },
    async create(values) { inserted = values; return publicUser; }
  };
  const input = validateRegister(registration);
  const service = createAuthService(repository, tokens);
  const result = await service.register(input);
  assert.equal(result.role, 'USER');
  assert.equal(inserted.roleId, '42');
  assert.equal(bcrypt.getRounds(inserted.passwordHash), 12);
  assert.equal(await bcrypt.compare(input.password, inserted.passwordHash), true);
  repository.create = async () => { throw { code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry for key 'users.uq_users_email'" }; };
  await assert.rejects(() => service.register(input), (error) => error.status === 409);
  repository.create = async () => { throw { code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry for key 'unrelated'" }; };
  await assert.rejects(() => service.register(input), (error) => error.status === undefined);
  repository.findUserRole = async () => undefined;
  await assert.rejects(() => service.register(input), /USER role/);
});

test('login failures share the same response and database failure is never a 401', async () => {
  const hash = await bcrypt.hash('valid-password', 12);
  let user;
  const repository = { async findByEmail() { return user; }, async findById() { throw new Error('Database failed'); } };
  const service = createAuthService(repository, tokens);
  const input = { email: publicUser.email, password: 'wrong-password' };
  let message;
  for (const candidate of [undefined, { ...publicUser, password_hash: hash }, { ...publicUser, password_hash: hash, account_status: 'SUSPENDED' }]) {
    user = candidate;
    await assert.rejects(() => service.login(candidate?.account_status === 'SUSPENDED' ? { ...input, password: 'valid-password' } : input), (error) => {
      assert.equal(error.status, 401); message ??= error.message; assert.equal(error.message, message); return true;
    });
  }
  await assert.rejects(() => service.authenticate(tokens.sign('7')), (error) => error.status !== 401 && /Database failed/.test(error.message));
});

test('HTTP rejects privilege fields, uses no-store, and does not expose DB errors', async () => {
  const repository = { async findByEmail() { throw new Error('SELECT password_hash FROM users password=secret'); } };
  const http = await serveApp(createApp({
    healthService: { async check() { return { status: 'ok', database: 'up' }; } },
    authService: createAuthService(repository, tokens), userService: createUserService(repository), logger: () => {}
  }));
  try {
    let response = await request(http, '/api/auth/register', { method: 'POST', body: { ...registration, role: 'ADMIN' } });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await request(http, '/api/auth/login', { method: 'POST', body: { email: publicUser.email, password: 'password' } });
    assert.equal(response.status, 500);
    assert.deepEqual(response.json, { success: false, message: 'Lỗi máy chủ nội bộ' });
    response = await request(http, '/api/users/me');
    assert.equal(response.status, 401);
  } finally { await http.close(); }
});
