import { assertIsolatedInstance, assertOwnedDatabase } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createAdminService } from '../services/admin.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { serve, allMatches } from './helpers.js';
import { request } from './auth/helpers.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createTokenService } from '../utils/jwt.js';
import { assertNoPrivateData } from './fixtures/security.js';

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Lock barrier timed out')), 5000); })]); }
  finally { clearTimeout(timer); }
}
function holdPool(pool, predicate) {
  const held = deferred(), resume = deferred(); let intercepted = false;
  return { held, resume, async getConnection() {
    const connection = await pool.getConnection();
    return new Proxy(connection, { get(target, key) {
      if (key === 'query') return async (statement, values) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (!intercepted && predicate(sql)) { intercepted = true; held.resolve(); await bounded(resume.promise); }
        return target.query(statement, values);
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}

test('F04/F05: atomic moderation and dispute regression on isolated MySQL', { timeout: 120000 }, async (t) => {
  const base = configFromEnv(), name = `findit_test_${randomBytes(12).toString('hex')}`;
  const setup = await connect(base, false); let created = false, pool;
  try {
    await setup.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await setup.query(`USE \`${name}\``); await migrate(setup, name);
    const password = randomBytes(24).toString('hex');
    await seed(setup, name, { USER: { email: 'owner@moderation.test', password }, ADMIN: { email: 'admin@moderation.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [users] = await query(pool, 'SELECT u.user_id AS id,r.name AS role FROM users u JOIN roles r ON r.role_id=u.role_id');
    const owner = users.find((u) => u.role === 'USER'), admin = users.find((u) => u.role === 'ADMIN');
    const [added] = await query(pool, "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) SELECT role_id,'Second admin','second@moderation.test',password_hash,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users WHERE user_id=?", [admin.id]);
    const secondAdmin = { id: String(added.insertId), role: 'ADMIN' };
    const people = [];
    for (let i = 0; i < 3; i++) {
      const [result] = await query(pool, "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) SELECT role_id,?, ?,password_hash,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users WHERE user_id=?", [`Claimant ${i}`, `claimant${i}@moderation.test`, owner.id]);
      people.push({ id: String(result.insertId), role: 'USER' });
    }
    const [[category]] = await query(pool, 'SELECT category_id AS id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id AS id FROM locations LIMIT 1');
    const items = createItemService(createItemRepository(pool)), claims = createClaimService(createClaimRepository(pool));
    const admins = createAdminService(createAdminRepository(pool), items);
    const fresh = async (count = 2, actor = owner) => {
      const item = await items.create(actor, { title: 'Moderation test', description: 'Public description', type: 'FOUND', categoryId: Number(category.id), locationId: Number(location.id), eventDate: '2026-10-20', color: null });
      const entries = [];
      for (const person of people.slice(0, count)) entries.push(await claims.create(person, item.id, { proofDescription: 'SECRET_PROOF_MARKER' }));
      return { item, entries };
    };
    const state = async (id) => {
      const [[item]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [id]);
      const [entries] = await query(pool, 'SELECT claim_id,status,reviewed_at,proof_description FROM claims WHERE item_id=? ORDER BY claim_id', [id]);
      return { item, entries };
    };
    const effects = async (id) => {
      const [logs] = await query(pool, "SELECT log_id,user_id,action,entity_type,entity_id,details FROM activity_logs WHERE (entity_type='ITEM' AND entity_id=?) OR (entity_type='CLAIM' AND entity_id IN (SELECT claim_id FROM claims WHERE item_id=?)) ORDER BY log_id", [id, id]);
      const [entries] = await query(pool, 'SELECT claim_id FROM claims WHERE item_id=? ORDER BY claim_id', [id]);
      const keys = [`ITEM_MODERATED_CLOSED:${id}`, ...entries.flatMap((row) => ['NEW_CLAIM', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'CLAIM_COMPLETED', 'CLAIM_ADMIN_RESOLVED'].map((type) => `${type}:${row.claim_id}`))];
      const [notices] = await query(pool, `SELECT notification_id,user_id,type,event_key,message,is_read FROM notifications WHERE event_key IN (${keys.map(() => '?').join(',')}) ORDER BY notification_id`, keys);
      return { logs, notices };
    };
    const addedEffects = (before, after) => ({
      logs: after.logs.filter((row) => !before.logs.some((old) => old.log_id === row.log_id)),
      notices: after.notices.filter((row) => !before.notices.some((old) => old.notification_id === row.notification_id))
    });
    const assertNotices = (actual, expected, reason) => {
      const tuple = (row) => [String(row.user_id), row.type, row.event_key];
      assert.deepEqual(actual.map(tuple).sort(), expected.map(([user, type, id]) => [String(user), type, `${type}:${id}`]).sort());
      assert.ok(actual.every((row) => Number(row.is_read) === 0));
      assert.ok(!JSON.stringify(actual).includes('SECRET_PROOF_MARKER'));
      assert.ok(!JSON.stringify(actual).includes(reason));
    };

    await t.test('invalid Unicode HTTP returns 400 without acquiring a transaction or changing any DB effects', async () => {
      const { item, entries } = await fresh(); const before = { state: await state(item.id), effects: await effects(item.id) }; let acquisitions = 0;
      const wrapper = { async getConnection() { acquisitions++; return pool.getConnection(); } };
      const http = await serve({ healthService: { async check() {} }, authService: { async authenticate() { return admin; } }, userService: {}, adminService: createAdminService(createAdminRepository(wrapper), items) });
      try {
        for (const reason of ['\ud800', '\udfff', 'a\ud800b', '\udfff\ud800']) for (const [path, body] of [
          [`/items/${item.id}/close`, { reason }],
          [`/claims/${entries[0].id}/resolve`, { decision: 'APPROVE', reason }],
          [`/claims/${entries[0].id}/resolve`, { decision: 'REJECT', reason }]
        ]) {
          const result = await request(http, '/api/admin' + path, { token: 'valid', method: 'PATCH', body });
          assert.equal(result.status, 400); assert.equal(result.headers.get('cache-control'), 'no-store');
          assertNoPrivateData(assert, result.json, ['SECRET_PROOF_MARKER']);
        }
        assert.equal(acquisitions, 0);
        assert.deepEqual({ state: await state(item.id), effects: await effects(item.id) }, before);
        const validReason = '\ud83d\ude00'.repeat(1000);
        const closed = await request(http, `/api/admin/items/${item.id}/close`, { token: 'valid', method: 'PATCH', body: { reason: validReason } });
        assert.equal(closed.status, 200); assert.equal(closed.json.data.item.status, 'CLOSED');
        const next = await fresh(1);
        const resolved = await request(http, `/api/admin/claims/${next.entries[0].id}/resolve`, { token: 'valid', method: 'PATCH', body: { decision: 'APPROVE', reason: validReason } });
        assert.equal(resolved.status, 200); assert.equal(resolved.json.data.claim.status, 'APPROVED');
        assert.equal(acquisitions, 2, 'valid boundary inputs use one transaction per request');
        for (const id of [item.id, next.item.id]) {
          const logged = await effects(id);
          const parent = logged.logs.find((row) => ['ITEM_MODERATED_CLOSED', 'CLAIM_ADMIN_RESOLVED'].includes(row.action));
          assert.equal(parent.details.reason, validReason);
          assert.ok(!JSON.stringify(logged.notices).includes(validReason));
        }
      } finally { await http.close(); }
    });

    for (const [decision, count] of [['APPROVE', 3], ['REJECT', 2], ['REJECT', 1]]) await t.test(`resolve ${decision} with ${count} pending: exact linked audit and private notifications`, async () => {
      const { item, entries } = await fresh(count), before = await effects(item.id), reason = 'ADMIN_PRIVATE_REASON_MARKER';
      const result = await admins.resolveClaim(admin, entries[0].id, { decision, reason });
      const delta = addedEffects(before, await effects(item.id)), approved = decision === 'APPROVE';
      const changed = approved ? entries : entries.slice(0, 1);
      assert.equal(delta.logs.length, 1 + changed.length);
      const [parent] = delta.logs.filter((row) => row.action === 'CLAIM_ADMIN_RESOLVED');
      assert.ok(parent); assert.equal(String(parent.user_id), String(admin.id)); assert.equal(String(parent.entity_id), String(entries[0].id));
      assert.deepEqual(parent.details, { itemId: String(item.id), previousStatus: 'PENDING', status: approved ? 'APPROVED' : 'REJECTED', decision, reason, source: 'ADMIN_RESOLVE', autoRejectedClaimCount: approved ? count - 1 : 0 });
      for (const [index, entry] of changed.entries()) {
        const [child] = delta.logs.filter((row) => row.action !== 'CLAIM_ADMIN_RESOLVED' && String(row.entity_id) === String(entry.id));
        assert.ok(child); assert.equal(String(child.user_id), String(admin.id)); assert.equal(child.entity_type, 'CLAIM');
        assert.equal(child.action, approved && index === 0 ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED');
        assert.equal(child.details.decisionLogId, String(parent.log_id)); assert.equal(child.details.itemId, String(item.id));
        assert.equal(child.details.previousStatus, 'PENDING'); assert.equal(child.details.status, approved && index === 0 ? 'APPROVED' : 'REJECTED');
        assert.equal(child.details.source, 'ADMIN_RESOLVE'); assert.equal(child.details.automatic, index > 0 ? true : undefined); assert.equal(child.details.reason, undefined);
      }
      assert.ok(!JSON.stringify(delta.logs).includes('SECRET_PROOF_MARKER'));
      assertNotices(delta.notices, [[owner.id, 'CLAIM_ADMIN_RESOLVED', entries[0].id], ...changed.map((entry, index) => [entry.claimantId, approved && index === 0 ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', entry.id])], reason);
      assertNoPrivateData(assert, result, ['SECRET_PROOF_MARKER', reason]);
      const after = await state(item.id);
      assert.equal(after.item.status, approved ? 'CLAIMED' : count === 1 ? 'OPEN' : 'CLAIM_PENDING');
      assert.deepEqual(after.entries.map((row) => row.status), approved ? ['APPROVED', ...entries.slice(1).map(() => 'REJECTED')] : ['REJECTED', ...entries.slice(1).map(() => 'PENDING')]);
      assert.ok(after.entries.slice(0, changed.length).every((row) => row.reviewed_at));
    });
    await t.test('F04: pending close rejects all pending atomically, preserves history and legacy semantics', async () => {
      const { item, entries } = await fresh(3);
      await claims.reject(owner, entries[0].id);
      const before = await effects(item.id);
      await assert.rejects(() => admins.closeItem(admin, item.id), (e) => e.status === 400);
      const result = await admins.moderateClose(admin, item.id, { reason: 'PRIVATE_REASON_MARKER' });
      assert.equal(result.item.status, 'CLOSED'); assert.equal(result.rejectedClaimCount, 2);
      const after = await state(item.id); assert.equal(after.item.status, 'CLOSED');
      assert.ok(after.entries.every((c) => c.status === 'REJECTED' && c.reviewed_at && c.proof_description === 'SECRET_PROOF_MARKER'));
      const [logs] = await query(pool, "SELECT action,details FROM activity_logs WHERE entity_id=? AND entity_type='ITEM'", [item.id]);
      assert.equal(logs.at(-1).details.reason, 'PRIVATE_REASON_MARKER');
      const [notices] = await query(pool, "SELECT type,message FROM notifications WHERE event_key IN (?, ?, ?)", [`ITEM_MODERATED_CLOSED:${item.id}`, `CLAIM_REJECTED:${entries[1].id}`, `CLAIM_REJECTED:${entries[2].id}`]);
      assert.equal(notices.length, 3); assert.ok(!JSON.stringify(notices).includes('PRIVATE_REASON_MARKER'));
      assert.ok(!JSON.stringify(result).includes('PRIVATE_REASON_MARKER'));
      const delta = addedEffects(before, await effects(item.id));
      assert.equal(delta.logs.length, 3);
      const [parent] = delta.logs.filter((row) => row.action === 'ITEM_MODERATED_CLOSED');
      assert.ok(parent); assert.equal(String(parent.user_id), String(admin.id));
      assert.deepEqual(parent.details, { previousStatus: 'CLAIM_PENDING', status: 'CLOSED', reason: 'PRIVATE_REASON_MARKER', source: 'ADMIN_MODERATION', rejectedClaimCount: 2 });
      for (const entry of entries.slice(1)) {
        const [child] = delta.logs.filter((row) => row.action === 'CLAIM_REJECTED' && String(row.entity_id) === String(entry.id));
        assert.ok(child); assert.equal(String(child.user_id), String(admin.id));
        assert.deepEqual(child.details, { previousStatus: 'PENDING', status: 'REJECTED', itemId: String(item.id), automatic: true, source: 'ADMIN_MODERATION', decisionLogId: String(parent.log_id) });
      }
      assertNotices(delta.notices, [[owner.id, 'ITEM_MODERATED_CLOSED', item.id], ...entries.slice(1).map((entry) => [entry.claimantId, 'CLAIM_REJECTED', entry.id])], 'PRIVATE_REASON_MARKER');
      assert.ok(!JSON.stringify(delta.logs).includes('SECRET_PROOF_MARKER'));
      assert.equal((await items.get(item.id)).status, 'CLOSED', 'CLOSED remains publicly readable');
      await assert.rejects(() => claims.create(admin, item.id, { proofDescription: 'new' }), (e) => e.status === 409);
    });
    await t.test('F05: approve, reject remaining/last, terminal protection and recusal', async () => {
      const { item, entries } = await fresh(3);
      const approved = await admins.resolveClaim(admin, entries[1].id, { decision: 'APPROVE', reason: 'Decision' });
      assert.equal(approved.claim.status, 'APPROVED'); assert.equal(approved.item.status, 'CLAIMED'); assert.equal(approved.autoRejectedClaimCount, 2);
      assert.ok(!JSON.stringify(approved).includes('SECRET_PROOF_MARKER'));
      for (const entry of entries) await assert.rejects(() => admins.resolveClaim(admin, entry.id, { decision: 'REJECT', reason: 'Repeat' }), (e) => e.status === 409);
      await assert.rejects(() => admins.moderateClose(admin, item.id, { reason: 'Close' }), (e) => e.status === 409);
      await claims.complete(owner, entries[1].id);
      await assert.rejects(() => admins.resolveClaim(admin, entries[1].id, { decision: 'REJECT', reason: 'Repeat' }), (e) => e.status === 409);
      const next = await fresh();
      assert.equal((await admins.resolveClaim(admin, next.entries[0].id, { decision: 'REJECT', reason: 'One' })).item.status, 'CLAIM_PENDING');
      assert.equal((await admins.resolveClaim(admin, next.entries[1].id, { decision: 'REJECT', reason: 'Last' })).item.status, 'OPEN');
      await assert.rejects(() => claims.create(people[0], next.item.id, { proofDescription: 'again' }), (e) => e.status === 409);
      const own = await fresh(1, admin);
      await assert.rejects(() => admins.moderateClose(admin, own.item.id, { reason: 'Self' }), (e) => e.status === 403);
      await assert.rejects(() => admins.resolveClaim(admin, own.entries[0].id, { decision: 'APPROVE', reason: 'Self' }), (e) => e.status === 403);
      const related = await fresh(1); await claims.create(admin, related.item.id, { proofDescription: 'Related' });
      await assert.rejects(() => admins.resolveClaim(admin, related.entries[0].id, { decision: 'REJECT', reason: 'Self' }), (e) => e.status === 403);
      await assert.rejects(() => admins.moderateClose(admin, related.item.id, { reason: 'Self' }), (e) => e.status === 403);
    });
    for (const operation of ['close', 'approve', 'reject']) for (const failure of ['item', 'claim', 'audit', 'notification', 'child-audit', 'last-notification']) await t.test(`${operation}: ${failure} failure rolls back every write`, async () => {
      const { item, entries } = await fresh(); const before = await state(item.id);
      const [[counts]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM activity_logs) AS logs,(SELECT COUNT(*) FROM notifications) AS notices');
      const table = { item: 'items', claim: 'claims', audit: 'activity_logs', notification: 'notifications', 'child-audit': 'activity_logs', 'last-notification': 'notifications' }[failure];
      const condition = failure === 'child-audit' ? "NEW.action='CLAIM_REJECTED' OR NEW.action='CLAIM_APPROVED'" : failure === 'last-notification' ? `NEW.user_id=${people[operation === 'reject' ? 0 : 1].id}` : 'TRUE';
      await query(pool, `CREATE TRIGGER moderation_failure BEFORE ${['item', 'claim'].includes(failure) ? 'UPDATE' : 'INSERT'} ON ${table} FOR EACH ROW BEGIN IF ${condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='moderation injected failure'; END IF; END`);
      try {
        await assert.rejects(() => operation === 'close' ? admins.moderateClose(admin, item.id, { reason: 'Rollback' }) : admins.resolveClaim(admin, entries[0].id, { decision: operation === 'approve' ? 'APPROVE' : 'REJECT', reason: 'Rollback' }), /moderation injected failure/);
      } finally { await query(pool, 'DROP TRIGGER moderation_failure'); }
      assert.deepEqual(await state(item.id), before);
      const [[after]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM activity_logs) AS logs,(SELECT COUNT(*) FROM notifications) AS notices'); assert.deepEqual(after, counts);
    });

    await t.test('real HTTP/JWT lists, mutation envelopes, filters, UTC dates and privacy', async () => {
      const auth = createAuthService(createUserRepository(pool), createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
      const token = (await auth.login({ email: 'admin@moderation.test', password })).token;
      const http = await serve({ healthService: { async check() {} }, authService: auth, userService: {}, itemService: items, adminService: admins });
      try {
        const api = (path, options) => request(http, '/api/admin' + path, { token, ...options });
        const { item, entries } = await fresh(3);
        const result = await api(`/claims?itemId=${item.id}&status=PENDING&sort=oldest&limit=1&page=2`);
        assert.equal(result.status, 200); assert.equal(result.json.pagination.total, 3); assert.equal(result.json.data[0].id, entries[1].id);
        assertNoPrivateData(assert, result.json, ['SECRET_PROOF_MARKER', 'owner@moderation.test']);
        const resolved = await api(`/claims/${entries[0].id}/resolve`, { method: 'PATCH', body: { decision: 'REJECT', reason: 'ADMIN_PRIVATE_REASON' } });
        assert.equal(resolved.status, 200); assert.equal(resolved.json.data.item.status, 'CLAIM_PENDING');
        const closed = await api(`/items/${item.id}/close`, { method: 'PATCH', body: { reason: 'ADMIN_PRIVATE_REASON' } });
        assert.equal(closed.status, 200); assert.equal(closed.json.data.rejectedClaimCount, 2);
        for (const response of [resolved, closed]) assertNoPrivateData(assert, response.json, ['SECRET_PROOF_MARKER', 'ADMIN_PRIVATE_REASON']);
        await query(pool, "INSERT INTO activity_logs(action,entity_type,entity_id,details,created_at) VALUES('IMAGE_OPERATION_STARTED','ITEM',?, ?,UTC_TIMESTAMP()),('ITEM_MODERATED_CLOSED','ITEM',?, ?, '2026-01-03 23:59:59')", [item.id, JSON.stringify({ operationId: 'INTERNAL_MARKER' }), item.id, JSON.stringify({ previousStatus: 'OPEN', status: 'CLOSED', proof: 'SECRET_PROOF_MARKER', operationId: 'INTERNAL_MARKER', reason: null })]);
        const logs = await api(`/activity-logs?entityId=${item.id}&entityType=ITEM&action=ITEM_MODERATED_CLOSED&dateFrom=2026-01-03&dateTo=2026-01-03&sort=oldest`);
        assert.equal(logs.status, 200); assert.equal(logs.json.pagination.total, 1); assert.equal(logs.json.data[0].actorId, null); assert.equal(logs.json.data[0].details.reason, undefined);
        assertNoPrivateData(assert, logs.json, ['SECRET_PROOF_MARKER', 'INTERNAL_MARKER']);
        const all = await api('/activity-logs?limit=100'); assert.equal(all.status, 200);
        assert.ok(all.json.data.every((row) => !row.action.startsWith('IMAGE_'))); assertNoPrivateData(assert, all.json, ['SECRET_PROOF_MARKER', 'INTERNAL_MARKER']);
        assert.equal((await api('/claims?itemId=999999')).json.data.length, 0);
        assert.equal((await api('/items/999999/close', { method: 'PATCH', body: { reason: 'Missing' } })).status, 404);
        assert.equal((await api('/claims/999999/resolve', { method: 'PATCH', body: { reason: 'Missing', decision: 'REJECT' } })).status, 404);
      } finally { await http.close(); }
    });

    await t.test('inconsistent and terminal states are rejected without repairing historical data', async () => {
      for (const [type, status, claimStatus] of [['LOST', 'CLAIM_PENDING', 'PENDING'], ['FOUND', 'OPEN', 'PENDING'], ['FOUND', 'CLAIM_PENDING', 'APPROVED'], ['FOUND', 'CLAIM_PENDING', 'COMPLETED'], ['FOUND', 'CLAIMED', 'APPROVED'], ['FOUND', 'RETURNED', 'COMPLETED'], ['FOUND', 'CLOSED', 'REJECTED']]) {
        const { item, entries } = await fresh(1);
        await query(pool, 'UPDATE items SET type=?,status=? WHERE item_id=?', [type, status, item.id]);
        await query(pool, 'UPDATE claims SET status=? WHERE claim_id=?', [claimStatus, entries[0].id]);
        const before = await state(item.id);
        await assert.rejects(() => admins.moderateClose(admin, item.id, { reason: 'Invalid' }), (e) => e.status === 409);
        await assert.rejects(() => admins.resolveClaim(admin, entries[0].id, { reason: 'Invalid', decision: 'APPROVE' }), (e) => e.status === 409);
        assert.deepEqual(await state(item.id), before);
      }
      const empty = await fresh(0); await query(pool, "UPDATE items SET status='CLAIM_PENDING' WHERE item_id=?", [empty.item.id]);
      await assert.rejects(() => admins.moderateClose(admin, empty.item.id, { reason: 'Invalid' }), (e) => e.status === 409);
    });

    await t.test('stale suspended actor is denied on all four service entrypoints', async () => {
      const { item, entries } = await fresh(1);
      await admins.setUserStatus(secondAdmin, admin.id, 'SUSPENDED');
      try {
        for (const operation of [() => admins.moderateClose(admin, item.id, { reason: 'Stale' }), () => admins.resolveClaim(admin, entries[0].id, { decision: 'REJECT', reason: 'Stale' }), () => admins.listClaims(admin, { page: 1, limit: 10 }), () => admins.activityLogs(admin, { page: 1, limit: 10 })]) await assert.rejects(operation, (e) => e.status === 403);
        assert.equal((await state(item.id)).item.status, 'CLAIM_PENDING');
      } finally { await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [admin.id]); }
    });

    const observeWait = async (table) => bounded((async () => {
      for (;;) {
        const [[row]] = await query(pool, 'SELECT COUNT(*) AS total FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID WHERE l.OBJECT_SCHEMA=? AND l.OBJECT_NAME=?', [name, table]);
        if (Number(row.total)) return;
      }
    })());
    const actions = (db, item, entries) => {
      const service = createAdminService(createAdminRepository(db), items), ordinary = createClaimService(createClaimRepository(db));
      return {
        close: () => service.moderateClose(admin, item.id, { reason: 'Race' }),
        resolve: () => service.resolveClaim(admin, entries[0].id, { decision: 'APPROVE', reason: 'Race' }),
        otherResolve: () => service.resolveClaim(secondAdmin, entries[1].id, { decision: 'APPROVE', reason: 'Race' }),
        adminReject: () => service.resolveClaim(admin, entries[0].id, { decision: 'REJECT', reason: 'Race' }),
        sameResolve: () => service.resolveClaim(secondAdmin, entries[0].id, { decision: 'APPROVE', reason: 'Race' }),
        sameReject: () => service.resolveClaim(secondAdmin, entries[0].id, { decision: 'REJECT', reason: 'Race' }),
        otherReject: () => service.resolveClaim(secondAdmin, entries[1].id, { decision: 'REJECT', reason: 'Race' }),
        approve: () => ordinary.approve(owner, entries[0].id),
        reject: () => ordinary.reject(owner, entries[0].id),
        create: () => ordinary.create(people[2], item.id, { proofDescription: 'Race proof' })
      };
    };
    for (let round = 0; round < 3; round++) for (const [first, second, count, expected, extra = {}] of [
      ['close', 'create', 0, 'CLOSED'], ['create', 'close', 0, 'CLOSED'],
      ['close', 'approve', 2, 'CLOSED'], ['approve', 'close', 2, 'CLAIMED'],
      ['close', 'reject', 1, 'CLOSED'], ['reject', 'close', 1, 'CLOSED'],
      ['resolve', 'approve', 2, 'CLAIMED'], ['approve', 'resolve', 2, 'CLAIMED'],
      ['resolve', 'reject', 2, 'CLAIMED'], ['reject', 'resolve', 2, 'CLAIM_PENDING'],
      ['resolve', 'otherResolve', 2, 'CLAIMED'], ['otherResolve', 'resolve', 2, 'CLAIMED'],
      ['adminReject', 'approve', 2, 'CLAIM_PENDING', { claims: ['REJECTED', 'PENDING'] }],
      ['approve', 'adminReject', 2, 'CLAIMED', { claims: ['APPROVED', 'REJECTED'] }],
      ['adminReject', 'reject', 1, 'OPEN', { claims: ['REJECTED'] }],
      ['reject', 'adminReject', 1, 'OPEN', { claims: ['REJECTED'] }],
      ['adminReject', 'sameResolve', 2, 'CLAIM_PENDING', { claims: ['REJECTED', 'PENDING'] }],
      ['sameResolve', 'adminReject', 2, 'CLAIMED', { claims: ['APPROVED', 'REJECTED'] }],
      ['adminReject', 'sameReject', 1, 'OPEN', { claims: ['REJECTED'] }],
      ['sameReject', 'adminReject', 1, 'OPEN', { claims: ['REJECTED'] }],
      ['adminReject', 'otherResolve', 2, 'CLAIMED', { both: true, claims: ['REJECTED', 'APPROVED'] }],
      ['otherResolve', 'adminReject', 2, 'CLAIMED', { claims: ['REJECTED', 'APPROVED'] }],
      ['adminReject', 'otherReject', 2, 'OPEN', { both: true, claims: ['REJECTED', 'REJECTED'] }],
      ['otherReject', 'adminReject', 2, 'OPEN', { both: true, claims: ['REJECTED', 'REJECTED'] }]
    ]) await t.test(`lock wait: ${first} before ${second}, round ${round + 1}`, async () => {
      const { item, entries } = await fresh(count);
      const beforeEffects = extra.claims ? await effects(item.id) : undefined;
      const held = holdPool(pool, (sql) => /^(UPDATE items SET|UPDATE claims SET|INSERT INTO claims)/.test(sql));
      const winning = actions(held, item, entries)[first](); winning.catch(() => {});
      await bounded(held.held.promise);
      const losing = actions(pool, item, entries)[second](); losing.catch(() => {});
      let results;
      try { await observeWait('items'); }
      finally { held.resume.resolve(); results = await Promise.allSettled([winning, losing]); }
      assert.equal(results[0].status, 'fulfilled');
      const both = (first === 'create' || (first === 'reject' && second === 'close') || extra.both === true);
      if (both) assert.equal(results[1].status, 'fulfilled');
      else { assert.equal(results[1].status, 'rejected'); assert.equal(results[1].reason.status, 409); }
      const after = await state(item.id); assert.equal(after.item.status, expected);
      assert.ok(after.entries.filter((c) => ['APPROVED', 'COMPLETED'].includes(c.status)).length <= 1);
      if (expected === 'CLOSED') assert.ok(after.entries.every((c) => c.status === 'REJECTED'));
      if (extra.claims) {
        assert.deepEqual(after.entries.map((row) => row.status), extra.claims);
        const delta = addedEffects(beforeEffects, await effects(item.id));
        const successful = [first, ...(both ? [second] : [])];
        const isAdmin = (action) => !['approve', 'reject'].includes(action);
        const target = (action) => entries[action.startsWith('other') ? 1 : 0];
        const actor = (action) => action === 'adminReject' ? admin : isAdmin(action) ? secondAdmin : owner;
        const approvedAction = successful.find((action) => ['approve', 'sameResolve', 'otherResolve'].includes(action));
        const changed = after.entries.filter((row) => row.status !== 'PENDING');
        const parents = delta.logs.filter((row) => row.action === 'CLAIM_ADMIN_RESOLVED');
        assert.equal(parents.length, successful.filter(isAdmin).length);
        assert.equal(delta.logs.length, parents.length + changed.length, 'failed decision must not leave an audit or duplicate transition');
        for (const action of successful.filter(isAdmin)) {
          const parent = parents.find((row) => String(row.entity_id) === String(target(action).id));
          assert.ok(parent); assert.equal(String(parent.user_id), String(actor(action).id));
          assert.equal(parent.details.decision, action === approvedAction ? 'APPROVE' : 'REJECT');
          assert.equal(parent.details.reason, 'Race');
        }
        for (const entry of changed) {
          const child = delta.logs.find((row) => row.action !== 'CLAIM_ADMIN_RESOLVED' && String(row.entity_id) === String(entry.claim_id));
          assert.ok(child); assert.equal(child.action, entry.status === 'APPROVED' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED');
          assert.equal(child.details.itemId, String(item.id)); assert.equal(child.details.reason, undefined);
          if (child.details.source === 'ADMIN_RESOLVE') {
            const parent = parents.find((row) => String(row.log_id) === child.details.decisionLogId);
            assert.ok(parent); assert.equal(String(child.user_id), String(parent.user_id));
          } else assert.equal(child.details.decisionLogId, undefined);
        }
        assertNotices(delta.notices, [
          ...changed.map((entry) => [entries.find((row) => String(row.id) === String(entry.claim_id)).claimantId, entry.status === 'APPROVED' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', entry.claim_id]),
          ...successful.filter(isAdmin).map((action) => [owner.id, 'CLAIM_ADMIN_RESOLVED', target(action).id])
        ], 'Race');
        assert.ok(!JSON.stringify(delta.logs).includes('SECRET_PROOF_MARKER'));
      }
    });

    for (const operation of ['close', 'resolve']) for (const winner of ['moderation', 'suspend']) await t.test(`${operation} versus suspend: ${winner} wins at real role lock`, async () => {
      await query(pool, "UPDATE users SET account_status='ACTIVE'");
      const { item, entries } = await fresh();
      const held = holdPool(pool, (sql) => winner === 'moderation' ? sql.startsWith('UPDATE claims SET') : sql.startsWith('UPDATE users SET'));
      const actor = winner === 'moderation' ? createAdminService(createAdminRepository(held), items) : admins;
      const statuses = winner === 'suspend' ? createAdminService(createAdminRepository(held), items) : admins;
      const write = () => operation === 'close' ? actor.moderateClose(admin, item.id, { reason: 'Race' }) : actor.resolveClaim(admin, entries[0].id, { decision: 'APPROVE', reason: 'Race' });
      const suspend = () => statuses.setUserStatus(secondAdmin, admin.id, 'SUSPENDED');
      const first = (winner === 'moderation' ? write : suspend)(); first.catch(() => {});
      await bounded(held.held.promise);
      const second = (winner === 'moderation' ? suspend : write)(); second.catch(() => {});
      let results;
      try { await observeWait('roles'); } finally { held.resume.resolve(); results = await Promise.allSettled([first, second]); }
      assert.equal(results[0].status, 'fulfilled');
      if (winner === 'suspend') { assert.equal(results[1].status, 'rejected'); assert.equal(results[1].reason.status, 403); assert.equal((await state(item.id)).item.status, 'CLAIM_PENDING'); }
      else { assert.equal(results[1].status, 'fulfilled'); assert.equal((await state(item.id)).item.status, operation === 'close' ? 'CLOSED' : 'CLAIMED'); }
      await query(pool, "UPDATE users SET account_status='ACTIVE'");
    });

    await t.test('close during storage upload preserves image admission and cleanup; Matching remains filtered', async () => {
      const { item } = await fresh(0); const held = deferred(), resume = deferred(), removed = [];
      const lost = await items.create(people[0], { title: 'Moderation test', description: 'Public description', type: 'LOST', categoryId: Number(category.id), locationId: Number(location.id), eventDate: '2026-10-20', color: null });
      const matching = createMatchingService(createMatchingRepository(pool));
      assert.ok((await allMatches(matching, lost.id)).some((row) => row.itemId === item.id));
      const storage = { async upload(_bytes, _mime, id) { held.resolve(); await bounded(resume.promise); return { publicId: id, url: 'https://example.test/image.png' }; }, async destroy(id) { removed.push(id); } };
      const images = createItemService(createItemRepository(pool), storage, createImageOperations(pool, storage));
      const uploading = images.uploadImages(owner, item.id, [{ mimetype: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10]) }]); uploading.catch(() => {});
      await bounded(held.promise);
      try { await admins.moderateClose(admin, item.id, { reason: 'Upload race' }); }
      finally { resume.resolve(); }
      await assert.rejects(() => uploading, (e) => e.status === 400);
      assert.equal(removed.length, 1); assert.equal((await items.get(item.id)).images.length, 0);
      assert.ok(!(await allMatches(matching, lost.id)).some((row) => row.itemId === item.id));
      const [[history]] = await query(pool, 'SELECT COUNT(*) AS total FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, item.id]); assert.equal(Number(history.total), 1);
    });

    await t.test('large batch close is atomic without selecting evidence; late batch failure rolls back', async () => {
      const { item } = await fresh(0); const values = [];
      for (let i = 0; i < 120; i++) {
        const [person] = await query(pool, "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) SELECT role_id,'Batch',?,password_hash,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users WHERE user_id=?", [`batch${i}@moderation.test`, owner.id]);
        values.push([person.insertId, item.id, 'BATCH_SECRET', 'PENDING']);
      }
      await query(pool, `INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at) VALUES ${values.map(() => '(?,?,?,?,UTC_TIMESTAMP())').join(',')}`, values.flat());
      await query(pool, "UPDATE items SET status='CLAIM_PENDING' WHERE item_id=?", [item.id]);
      const before = await state(item.id), lastId = before.entries.at(-1).claim_id;
      await query(pool, `CREATE TRIGGER batch_failure BEFORE UPDATE ON claims FOR EACH ROW BEGIN IF NEW.claim_id=${lastId} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='late batch failure'; END IF; END`);
      try { await assert.rejects(() => admins.moderateClose(admin, item.id, { reason: 'Batch' }), /late batch failure/); }
      finally { await query(pool, 'DROP TRIGGER batch_failure'); }
      assert.deepEqual(await state(item.id), before);
      const result = await admins.moderateClose(admin, item.id, { reason: 'Batch' }); assert.equal(result.rejectedClaimCount, 120);
      assert.ok((await state(item.id)).entries.every((row) => row.status === 'REJECTED'));
    });

    await t.test('close waits for Matching before role/actor locks, so a queued actor can be suspended', async () => {
      const { item } = await fresh(0);
      const held = holdPool(pool, (sql) => sql.startsWith('UPDATE items SET'));
      const updating = createItemService(createItemRepository(held)).update(owner, item.id, { title: 'Matching writer' }); updating.catch(() => {});
      await bounded(held.held.promise);
      const closing = admins.moderateClose(admin, item.id, { reason: 'Queued' }); closing.catch(() => {});
      const lockName = `findit:match:${createHash('sha256').update(name).digest('hex').slice(0, 48)}`;
      try {
        await bounded((async () => {
          for (;;) {
            const [[row]] = await query(pool, "SELECT COUNT(*) AS total FROM information_schema.processlist WHERE STATE='User lock' AND INFO LIKE ?", [`%${lockName}%`]);
            if (Number(row.total)) return;
          }
        })());
        await admins.setUserStatus(secondAdmin, admin.id, 'SUSPENDED');
      } finally { held.resume.resolve(); await updating; }
      try {
        await assert.rejects(() => closing, (e) => e.status === 403);
        assert.equal((await state(item.id)).item.status, 'OPEN');
      } finally { await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [admin.id]); }
    });

    await t.test('moderation uses one connection and no evidence SELECT; all sessions and advisory locks are released', async () => {
      const { item, entries } = await fresh(2); let acquisitions = 0; const statements = [];
      const wrapper = { async getConnection() {
        acquisitions++; const connection = await pool.getConnection();
        return new Proxy(connection, { get(target, key) {
          if (key === 'query') return (statement, values) => { statements.push(typeof statement === 'string' ? statement : statement.sql); return target.query(statement, values); };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const service = createAdminService(createAdminRepository(wrapper), items);
      await service.listClaims(admin, { page: 1, limit: 10 });
      await service.resolveClaim(admin, entries[0].id, { decision: 'REJECT', reason: 'Scoped' });
      await service.moderateClose(admin, item.id, { reason: 'Scoped' });
      await service.activityLogs(admin, { page: 1, limit: 10 });
      assert.equal(acquisitions, 4, 'one acquisition for each request, no nested transactions or pool queries');
      assert.ok(statements.every((sql) => !/SELECT.*(proof_description|password_hash|email|cloudinary_public_id)/i.test(sql)));
      const lockName = `findit:match:${createHash('sha256').update(name).digest('hex').slice(0, 48)}`;
      const [[lock]] = await query(pool, 'SELECT IS_FREE_LOCK(?) AS free', [lockName]); assert.equal(Number(lock.free), 1);
      assert.equal(pool.pool._freeConnections.length, pool.pool._allConnections.length);
    });
  } finally {
    if (pool) await pool.end();
    try { if (created) { assertOwnedDatabase(name, name); await setup.query(`DROP DATABASE \`${name}\``); } } finally { await setup.end(); }
  }
});
