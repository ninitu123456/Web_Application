import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { quote } from '../../database/schema.js';
import { createDbPool, query } from '../config/db.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

test('Claim integration: private evidence, state machine, MySQL transactions and concurrency', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Use npm run test:integration:isolated; this suite refuses the installed database');
  const base = configFromEnv(), adminConnection = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let created = false, pool, http;
  try {
    const [[instance]] = await adminConnection.query('SELECT @@datadir AS directory, @@port AS port');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR)); assert.equal(Number(instance.port), base.port);
    await adminConnection.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await adminConnection.query(`USE ${quote(name)}`); await migrate(adminConnection, name);
    const password = randomBytes(18).toString('hex');
    await seed(adminConnection, name, { USER: { email: 'user@claims.test', password }, ADMIN: { email: 'admin@claims.test', password } });
    pool = createDbPool({ ...base, database: name });
    const users = createUserRepository(pool), auth = createAuthService(users, createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
    const service = createClaimService(createClaimRepository(pool));
    http = await serveApp(createApp({ healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users), itemService: {}, claimService: service, logger: () => {} }));
    const userLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'user@claims.test', password } });
    const adminLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'admin@claims.test', password } });
    assert.equal(userLogin.status, 200); assert.equal(adminLogin.status, 200);
    const ownerToken = userLogin.json.data.token, adminToken = adminLogin.json.data.token;
    const ownerId = userLogin.json.data.user.id;
    const otherLogin = await request(http, '/api/auth/register', { method: 'POST', body: { fullName: 'Claimant Two', email: 'second@claims.test', password } });
    assert.equal(otherLogin.status, 201);
    const secondLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'second@claims.test', password } });
    assert.equal(secondLogin.status, 200);
    const secondToken = secondLogin.json.data.token;
    const unrelatedLogin = await request(http, '/api/auth/register', { method: 'POST', body: { fullName: 'Claimant Three', email: 'third@claims.test', password } });
    assert.equal(unrelatedLogin.status, 201);
    const thirdLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'third@claims.test', password } });
    const thirdToken = thirdLogin.json.data.token;
    const [[category]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
    async function makeItem(type = 'FOUND') {
      const [result] = await query(pool, "INSERT INTO items (user_id, category_id, location_id, title, description, type, event_date, status, created_at, updated_at) VALUES (?, ?, ?, 'Claim test item', 'Public description', ?, '2026-10-20', 'OPEN', UTC_TIMESTAMP(), UTC_TIMESTAMP())", [ownerId, category.category_id, location.location_id, type]);
      return Number(result.insertId);
    }
    const create = (id, token, proof = 'private ownership evidence') => request(http, `/api/items/${id}/claims`, { method: 'POST', token, body: { proofDescription: proof } });
    const statuses = async (id) => (await query(pool, 'SELECT status FROM claims WHERE item_id=? ORDER BY claim_id', [id]))[0].map((row) => row.status);

    await t.test('create validation, authentication, owner view, mine view, privacy, and duplicate behavior', async () => {
      const found = await makeItem(); const lost = await makeItem('LOST');
      assert.equal((await create(found, null)).status, 401);
      assert.equal((await create(found, secondToken, '  ')).status, 400);
      assert.equal((await create(found, secondToken, 'ok',)).status, 201);
      assert.equal((await create(found, secondToken)).status, 409);
      assert.equal((await create(lost, thirdToken)).status, 400);
      assert.equal((await create(found, ownerToken)).status, 403);
      assert.equal((await request(http, `/api/items/${found}/claims`, { token: thirdToken })).status, 403);
      const received = await request(http, `/api/items/${found}/claims`, { token: ownerToken });
      assert.equal(received.status, 200); assert.equal(received.json.data[0].proofDescription, 'ok');
      assert.equal((await request(http, `/api/claims/mine`, { token: secondToken })).json.data[0].item.title, 'Claim test item');
      const publicResponse = await request(http, `/api/items/${found}`);
      assert.ok(!JSON.stringify(publicResponse.json).includes('ownership evidence'));
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIM_PENDING');
    });

    await t.test('competing creates and approvals serialize; at most one approved Claim remains', async () => {
      const found = await makeItem();
      const sameClaimantItem = await makeItem();
      const duplicateCreations = await Promise.all([create(sameClaimantItem, secondToken, 'same user request A'), create(sameClaimantItem, secondToken, 'same user request B')]);
      assert.equal(duplicateCreations.filter((response) => response.status === 201).length, 1);
      assert.equal(duplicateCreations.filter((response) => response.status === 409).length, 1);
      const responses = await Promise.all([create(found, secondToken, 'second-user proof'), create(found, thirdToken, 'third-user proof')]);
      assert.deepEqual(responses.map((response) => response.status), [201, 201]);
      const received = (await request(http, `/api/items/${found}/claims`, { token: ownerToken })).json.data;
      const [first, second] = received;
      const approvals = await Promise.all([request(http, `/api/claims/${first.id}/approve`, { method: 'PATCH', token: ownerToken }), request(http, `/api/claims/${second.id}/approve`, { method: 'PATCH', token: ownerToken })]);
      assert.equal(approvals.filter((response) => response.status === 200).length, 1);
      assert.equal(approvals.filter((response) => response.status === 409).length, 1);
      assert.equal((await statuses(found)).filter((status) => status === 'APPROVED').length, 1);
      assert.equal((await statuses(found)).filter((status) => status === 'REJECTED').length, 1);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIM_PENDING');
      const unrelatedAdminApproval = await request(http, `/api/claims/${(first.status === 'APPROVED' ? second : first).id}/approve`, { method: 'PATCH', token: adminToken });
      assert.equal(unrelatedAdminApproval.status, 403);
    });

    await t.test('Claim creation racing with Item close has one consistent winner', async () => {
      const found = await makeItem();
      const { transaction } = await import('../config/db.js');
      const close = () => transaction(pool, async (connection) => {
        await connection.query('SELECT item_id FROM items WHERE item_id=? FOR UPDATE', [found]);
        const [result] = await connection.query("UPDATE items SET status='CLOSED', updated_at=UTC_TIMESTAMP() WHERE item_id=? AND status='OPEN'", [found]);
        return result.affectedRows;
      });
      const [claimResult, closeResult] = await Promise.all([create(found, secondToken), close()]);
      const [[item]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]);
      if (claimResult.status === 201) { assert.equal(closeResult, 0); assert.equal(item.status, 'CLAIM_PENDING'); assert.deepEqual(await statuses(found), ['PENDING']); }
      else { assert.equal(claimResult.status, 409); assert.equal(closeResult, 1); assert.equal(item.status, 'CLOSED'); assert.deepEqual(await statuses(found), []); }
    });

    await t.test('rejecting claims reopens item only after final pending Claim is rejected', async () => {
      const found = await makeItem(); await create(found, secondToken); await create(found, thirdToken);
      const claims = (await request(http, `/api/items/${found}/claims`, { token: ownerToken })).json.data;
      assert.equal((await request(http, `/api/claims/${claims[0].id}/reject`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIM_PENDING');
      assert.equal((await request(http, `/api/claims/${claims[1].id}/reject`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'OPEN');
      assert.equal((await request(http, `/api/claims/${claims[1].id}/approve`, { method: 'PATCH', token: ownerToken })).status, 409);
    });

    await t.test('completion atomically changes APPROVED to COMPLETED and CLAIM_PENDING to RETURNED', async () => {
      const found = await makeItem(); const createdClaim = await create(found, secondToken);
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/complete`, { method: 'PATCH', token: ownerToken })).status, 409);
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/approve`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/complete`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.deepEqual(await statuses(found), ['COMPLETED']);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'RETURNED');
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/complete`, { method: 'PATCH', token: ownerToken })).status, 409);
    });

    await t.test('approval and completion failures roll back Claim, Item, and audit together', async () => {
      const found = await makeItem(), made = await create(found, secondToken), claimId = made.json.data.id;
      const faultyPool = { async getConnection() {
        const connection = await pool.getConnection();
        return new Proxy(connection, { get(target, key) {
          if (key === 'query') return async (statement, values) => {
            const sql = typeof statement === 'string' ? statement : statement.sql;
            if (sql.startsWith('INSERT INTO activity_logs')) throw new Error('injected audit failure');
            if (sql.startsWith("UPDATE items SET status = 'RETURNED'")) throw new Error('injected item update failure');
            return target.query(statement, values);
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const faulty = createClaimService(createClaimRepository(faultyPool));
      await assert.rejects(() => faulty.approve({ id: String(ownerId), role: 'USER' }, claimId), /injected audit failure/);
      assert.deepEqual(await statuses(found), ['PENDING']);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIM_PENDING');
      await service.approve({ id: String(ownerId), role: 'USER' }, claimId);
      await assert.rejects(() => faulty.complete({ id: String(ownerId), role: 'USER' }, claimId), /injected item update failure/);
      assert.deepEqual(await statuses(found), ['APPROVED']);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIM_PENDING');
      const logs = await query(pool, "SELECT action FROM activity_logs WHERE entity_type='CLAIM' AND entity_id=? ORDER BY log_id", [claimId]);
      assert.deepEqual(logs[0].map((row) => row.action), ['CLAIM_APPROVED']);
    });
  } finally {
    if (http) await http.close(); if (pool) await pool.end();
    try { if (created) { assert.match(name, /^findit_test_[a-f0-9]{24}$/); await adminConnection.query(`DROP DATABASE ${quote(name)}`); } }
    finally { await adminConnection.end(); }
  }
});
