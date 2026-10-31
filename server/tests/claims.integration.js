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
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { setTimeout as delay } from 'node:timers/promises';
import { createClaimService } from '../services/claim.service.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

function assertNoEvidence(response, evidence) {
  assert.equal(response.status, 200);
  assert.equal(response.json.success, true);
  assert.equal(JSON.stringify(response.json).includes(evidence), false, 'Private evidence leaked');
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['proofDescription', 'proof_description', 'privateIdentifiers', 'private_identifiers'].includes(key), 'Private field leaked');
      inspect(child);
    }
  }
  inspect(response.json);
}

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
    const itemService = createItemService(createItemRepository(pool));
    const matchingService = createMatchingService(createMatchingRepository(pool));
    const appOptions = { healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users), itemService, matchingService, claimService: service, logger: () => {} };
    http = await serveApp(createApp(appOptions));
    const userLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'user@claims.test', password } });
    const adminLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'admin@claims.test', password } });
    assert.equal(userLogin.status, 200); assert.equal(adminLogin.status, 200);
    const ownerToken = userLogin.json.data.token, adminToken = adminLogin.json.data.token;
    const ownerId = userLogin.json.data.user.id;
    const owner = { id: String(ownerId), role: 'USER' };
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
    async function makeItem(type = 'FOUND', identity = owner) {
      const item = await itemService.create(identity, { title: 'Claim test item', description: 'Public description', type,
        categoryId: Number(category.category_id), locationId: Number(location.location_id), eventDate: '2026-10-20', color: null });
      return item.id;
    }
    const create = (id, token, proof = 'private ownership evidence') => request(http, `/api/items/${id}/claims`, { method: 'POST', token, body: { proofDescription: proof } });
    const statuses = async (id) => (await query(pool, 'SELECT status FROM claims WHERE item_id=? ORDER BY claim_id', [id]))[0].map((row) => row.status);

    await t.test('create validation, authentication, owner view, mine view, privacy, and duplicate behavior', async () => {
      const found = await makeItem(); const lost = await makeItem('LOST');
      assert.equal((await create(found, null)).status, 401);
      assert.equal((await create(found, secondToken, '  ')).status, 400);
      const evidence = `claim-evidence-${randomBytes(24).toString('hex')}`;
      assert.equal((await create(found, secondToken, evidence)).status, 201);
      assert.equal((await create(found, secondToken)).status, 409);
      assert.equal((await create(lost, thirdToken)).status, 400);
      assert.equal((await create(found, ownerToken)).status, 403);
      assert.equal((await request(http, `/api/items/${found}/claims`, { token: thirdToken })).status, 403);
      const received = await request(http, `/api/items/${found}/claims`, { token: ownerToken });
      assert.equal(received.status, 200); assert.equal(received.json.data[0].proofDescription, evidence);
      const mine = await request(http, '/api/claims/mine', { token: secondToken });
      assert.equal(mine.status, 200); assert.equal(mine.json.data[0].item.title, 'Claim test item');
      assert.equal(mine.json.data[0].proofDescription, evidence);
      const publicResponse = await request(http, `/api/items/${found}`);
      assertNoEvidence(publicResponse, evidence);
      assert.deepEqual(Object.keys(publicResponse.json.data).sort(), ['id', 'userId', 'categoryId', 'locationId', 'title', 'description', 'type', 'color', 'eventDate', 'status', 'createdAt', 'updatedAt', 'category', 'location', 'images'].sort());
      assert.equal(publicResponse.json.data.id, found); assert.equal(publicResponse.json.data.type, 'FOUND');
      assert.equal(publicResponse.json.data.status, 'CLAIM_PENDING'); assert.ok(Array.isArray(publicResponse.json.data.images));
      const search = await request(http, '/api/items?keyword=Claim&type=FOUND');
      assertNoEvidence(search, evidence);
      assert.ok(search.json.data.some((item) => item.id === found));
      assert.ok(search.json.pagination.total >= 1);
      const matches = await request(http, `/api/items/${lost}/matches`, { token: secondToken });
      assertNoEvidence(matches, evidence);
      assert.ok(matches.json.data.some((match) => match.itemId === found && match.score >= 50));
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIM_PENDING');

      // Negative control: an actual HTTP endpoint with a deliberately leaking DTO
      // must be caught, even though its status and public fields are valid.
      const leaking = await serveApp(createApp({ ...appOptions, itemService: {
        ...itemService, async get(id) { return { ...await itemService.get(id), proofDescription: evidence }; }
      } }));
      try {
        const leaked = await request(leaking, `/api/items/${found}`);
        assert.equal(leaked.status, 200);
        assert.throws(() => assertNoEvidence(leaked, evidence), /Private evidence leaked/);
        const leakedField = { status: publicResponse.status, json: structuredClone(publicResponse.json) };
        leakedField.json.data.proof_description = 'redacted';
        assert.throws(() => assertNoEvidence(leakedField, evidence), /Private field leaked/);
      } finally { await leaking.close(); }
    });

    await t.test('ADMIN can submit a Claim but cannot self-claim, duplicate, or claim invalid Items', async () => {
      const found = await makeItem();
      const made = await create(found, adminToken);
      assert.equal(made.status, 201); assert.equal(made.json.data.claimantId, adminLogin.json.data.user.id);
      assert.equal((await create(found, adminToken)).status, 409);
      const own = await makeItem('FOUND', { id: String(adminLogin.json.data.user.id), role: 'ADMIN' });
      assert.equal((await create(own, adminToken)).status, 403);
      assert.deepEqual(await statuses(own), []);
      assert.equal((await create(await makeItem('LOST'), adminToken)).status, 400);
      const closed = await makeItem();
      assert.equal((await request(http, `/api/items/${closed}/close`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.equal((await create(closed, adminToken)).status, 409);
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
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIMED');
      const unrelatedAdminApproval = await request(http, `/api/claims/${(first.status === 'APPROVED' ? second : first).id}/approve`, { method: 'PATCH', token: adminToken });
      assert.equal(unrelatedAdminApproval.status, 403);
    });

    await t.test('Claim creation racing with Item close has one consistent winner', async () => {
      const found = await makeItem();
      const [claimResult, closeResult] = await Promise.all([create(found, secondToken), request(http, `/api/items/${found}/close`, { method: 'PATCH', token: ownerToken })]);
      const [[item]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]);
      if (claimResult.status === 201) { assert.equal(closeResult.status, 400); assert.equal(item.status, 'CLAIM_PENDING'); assert.deepEqual(await statuses(found), ['PENDING']); }
      else { assert.equal(claimResult.status, 409); assert.equal(closeResult.status, 200); assert.equal(item.status, 'CLOSED'); assert.deepEqual(await statuses(found), []); }
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

    await t.test('completion atomically changes APPROVED to COMPLETED and CLAIMED to RETURNED', async () => {
      const found = await makeItem(); const createdClaim = await create(found, secondToken);
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/complete`, { method: 'PATCH', token: ownerToken })).status, 409);
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/approve`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'CLAIMED');
      assert.equal((await create(found, thirdToken)).status, 409);
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/complete`, { method: 'PATCH', token: ownerToken })).status, 200);
      assert.deepEqual(await statuses(found), ['COMPLETED']);
      assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [found]))[0][0].status, 'RETURNED');
      assert.equal((await request(http, `/api/claims/${createdClaim.json.data.id}/complete`, { method: 'PATCH', token: ownerToken })).status, 409);
      assert.equal((await create(found, thirdToken)).status, 409);
    });

    await t.test('a held Item row lock blocks creation until the owning transaction releases it', async () => {
      const found = await makeItem();
      const connection = await pool.getConnection();
      let pending, waiting = false;
      try {
        await connection.beginTransaction();
        await connection.query('SELECT item_id FROM items WHERE item_id=? FOR UPDATE', [found]);
        pending = create(found, secondToken);
        // Observe the actual InnoDB wait, rather than inferring locking from timing.
        const deadline = Date.now() + 2500;
        while (Date.now() < deadline && !waiting) {
          const [[row]] = await query(pool, `SELECT COUNT(*) AS waiting FROM performance_schema.data_lock_waits w
            JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE
            WHERE l.OBJECT_SCHEMA=? AND l.OBJECT_NAME='items'`, [name]);
          waiting = Number(row.waiting) > 0;
          if (!waiting) await delay(20);
        }
        assert.deepEqual(await statuses(found), []);
      } finally { await connection.rollback(); connection.release(); }
      assert.equal((await pending).status, 201);
      assert.equal(waiting, true, 'Expected a real InnoDB row lock wait');
      assert.deepEqual(await statuses(found), ['PENDING']);
    });

    // Keep real MySQL statements and transactions. At the chosen boundary ask
    // MySQL itself to raise an SQL error; never fake a rollback or its results.
    function failingService(matches, { zeroRows = false } = {}) {
      let injected = false;
      const faultyPool = { async getConnection() {
        const connection = await pool.getConnection();
        return new Proxy(connection, { get(target, key) {
          if (key === 'query') return async (statement, values) => {
            const sql = typeof statement === 'string' ? statement : statement.sql;
            if (!injected && matches(sql, values ?? [])) {
              injected = true;
              if (zeroRows) return [{ affectedRows: 0 }];
              return target.query("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected claim SQL failure'");
            }
            return target.query(statement, values);
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      return { service: createClaimService(createClaimRepository(faultyPool)), injected: () => injected };
    }
    async function snapshot(itemId) {
      const [items] = await query(pool, 'SELECT * FROM items WHERE item_id=?', [itemId]);
      const [claims] = await query(pool, 'SELECT * FROM claims WHERE item_id=? ORDER BY claim_id', [itemId]);
      const [logs] = await query(pool, "SELECT * FROM activity_logs WHERE entity_type='CLAIM' AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.itemId'))=? ORDER BY log_id", [String(itemId)]);
      return { items, claims, logs };
    }
    const claimWrite = (sql) => sql.startsWith('UPDATE claims SET status = ?');
    const auditWrite = (sql) => sql.startsWith('INSERT INTO activity_logs');
    const itemWrite = (status) => (sql) => sql.startsWith(`UPDATE items SET status = '${status}'`);
    const readBack = (sql) => sql.startsWith('SELECT c.claim_id') && sql.includes('WHERE c.claim_id = ?') && !sql.endsWith('FOR UPDATE');
    const operationCases = [
      { action: 'create', failures: [['claim insert', (sql) => sql.startsWith('INSERT INTO claims')], ['item update', itemWrite('CLAIM_PENDING')], ['read after item update', readBack]] },
      { action: 'approve', failures: [['claim update', claimWrite], ['item update', itemWrite('CLAIMED')], ['approval audit', auditWrite],
        ['competitor update', (sql) => sql.startsWith("UPDATE claims SET status = 'REJECTED'")],
        ['competitor audit after rejection', (sql, values) => auditWrite(sql) && values[1] === 'CLAIM_REJECTED']] },
      { action: 'reject', failures: [['claim update', claimWrite], ['rejection audit', auditWrite], ['item reopen', itemWrite('OPEN')]] },
      { action: 'complete', failures: [['claim update', claimWrite], ['item return', itemWrite('RETURNED')], ['completion audit', auditWrite]] }
    ];
    for (const { action, failures } of operationCases) {
      for (const [boundary, matches] of failures) {
        await t.test(`${action}: SQL failure at ${boundary} rolls back Claim, Item, competitors and audit`, async () => {
          const found = await makeItem();
          let claimId;
          if (action !== 'create') {
            const made = await create(found, secondToken); assert.equal(made.status, 201); claimId = made.json.data.id;
            if (action === 'approve') assert.equal((await create(found, thirdToken)).status, 201);
            if (action === 'complete') await service.approve(owner, claimId);
          }
          const before = await snapshot(found);
          const faulty = failingService(matches);
          await assert.rejects(() => action === 'create'
            ? faulty.service.create({ id: String(secondLogin.json.data.user.id), role: 'USER' }, found, { proofDescription: 'rollback evidence' })
            : faulty.service[action](owner, claimId), (error) => error.code === 'ER_SIGNAL_EXCEPTION' && /injected claim SQL failure/.test(error.message));
          assert.equal(faulty.injected(), true);
          assert.deepEqual(await snapshot(found), before);
          // A subsequent real request also checks that the pooled session has no
          // abandoned transaction/lock and that the failed operation can be retried.
          if (action === 'create') assert.equal((await create(found, secondToken)).status, 201);
          else await service[action](owner, claimId);
        });
      }
    }
    for (const action of ['approve', 'complete']) {
      await t.test(`${action}: zero affected Item rows aborts and rolls back the Claim update`, async () => {
        const found = await makeItem(), made = await create(found, secondToken), claimId = made.json.data.id;
        if (action === 'complete') await service.approve(owner, claimId);
        const before = await snapshot(found);
        const faulty = failingService(itemWrite(action === 'approve' ? 'CLAIMED' : 'RETURNED'), { zeroRows: true });
        await assert.rejects(() => faulty.service[action](owner, claimId), (error) => error.status === 409);
        assert.equal(faulty.injected(), true); assert.deepEqual(await snapshot(found), before);
      });
    }
    for (const action of ['approve', 'reject', 'complete']) {
      await t.test(`${action}: zero affected Claim rows aborts without changing Item or audit`, async () => {
        const found = await makeItem(), made = await create(found, secondToken), claimId = made.json.data.id;
        if (action === 'complete') await service.approve(owner, claimId);
        const before = await snapshot(found);
        const faulty = failingService(claimWrite, { zeroRows: true });
        await assert.rejects(() => faulty.service[action](owner, claimId), (error) => error.status === 409);
        assert.equal(faulty.injected(), true); assert.deepEqual(await snapshot(found), before);
      });
    }
    await t.test('all persisted Claim/Item states and audit histories remain consistent after failures and races', async () => {
      const [items] = await query(pool, `SELECT i.item_id, i.status,
        SUM(c.status='PENDING') AS pending, SUM(c.status='APPROVED') AS approved, SUM(c.status='COMPLETED') AS completed
        FROM items i LEFT JOIN claims c ON c.item_id=i.item_id GROUP BY i.item_id, i.status`);
      for (const item of items) {
        const pending = Number(item.pending), approved = Number(item.approved), completed = Number(item.completed);
        assert.ok(approved + completed <= 1, `Multiple winning Claims for Item ${item.item_id}`);
        if (item.status === 'CLAIM_PENDING') { assert.ok(pending > 0); assert.equal(approved + completed, 0); }
        else if (item.status === 'CLAIMED') { assert.equal(approved, 1); assert.equal(pending + completed, 0); }
        else if (item.status === 'RETURNED') { assert.equal(completed, 1); assert.equal(pending + approved, 0); }
        else assert.equal(pending + approved + completed, 0);
      }
      const [claims] = await query(pool, 'SELECT claim_id, status, proof_description FROM claims');
      const [logs] = await query(pool, "SELECT entity_id, action, details FROM activity_logs WHERE entity_type='CLAIM' ORDER BY log_id");
      const expected = { PENDING: [], APPROVED: ['CLAIM_APPROVED'], REJECTED: ['CLAIM_REJECTED'], COMPLETED: ['CLAIM_APPROVED', 'CLAIM_COMPLETED'] };
      for (const claim of claims) {
        assert.deepEqual(logs.filter((log) => String(log.entity_id) === String(claim.claim_id)).map((log) => log.action), expected[claim.status]);
        assert.equal(JSON.stringify(logs).includes(claim.proof_description), false, 'Evidence appeared in audit logs');
      }
      assert.ok(logs.every((log) => claims.some((claim) => String(claim.claim_id) === String(log.entity_id))), 'Orphan Claim audit');
    });
  } finally {
    if (http) await http.close(); if (pool) await pool.end();
    try { if (created) { assert.match(name, /^findit_test_[a-f0-9]{24}$/); await adminConnection.query(`DROP DATABASE ${quote(name)}`); } }
    finally { await adminConnection.end(); }
  }
});
