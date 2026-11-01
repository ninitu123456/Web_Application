import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { createNotificationRepository } from '../repositories/notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';
import { createReportRepository } from '../repositories/report.repository.js';
import { createReportService } from '../services/report.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createAdminService } from '../services/admin.service.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

test('Phase 6 admin APIs: isolated MySQL authorization, moderation, lookups, dashboard and audit transactions', { timeout: 180000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Run test:integration:isolated; production databases are forbidden');
  const base = configFromEnv(), connection = await connect(base, false), name = `findit_test_${randomBytes(12).toString('hex')}`;
  let pool, http, created = false;
  try {
    const [[instance]] = await connection.query('SELECT @@datadir AS directory, @@port AS port');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR)); assert.equal(Number(instance.port), base.port);
    await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await connection.end();
    const db = await connect({ ...base, database: name }); await migrate(db, name);
    const password = randomBytes(18).toString('hex');
    await seed(db, name, { USER: { email: 'user@admin.test', password }, ADMIN: { email: 'admin@admin.test', password } }); await db.end();
    pool = createDbPool({ ...base, database: name });
    const users = createUserRepository(pool), auth = createAuthService(users, createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
    const items = createItemService(createItemRepository(pool)), claims = createClaimService(createClaimRepository(pool));
    const notifications = createNotificationService(createNotificationRepository(pool)), reports = createReportService(createReportRepository(pool));
    const adminService = createAdminService(createAdminRepository(pool), items);
    http = await serveApp(createApp({ healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users), itemService: items,
      matchingService: createMatchingService(createMatchingRepository(pool)), claimService: claims, notificationService: notifications, reportService: reports, adminService, logger: () => {} }));
    const login = async (email) => (await auth.login({ email, password }));
    const admin = await login('admin@admin.test'), user = await login('user@admin.test');
    const api = (path, token = admin.token, options = {}) => request(http, `/api/admin${path}`, { token, ...options });
    const [categoryRows] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
    const [locationRows] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
    const input = { title: 'Admin test item', description: 'public', type: 'LOST', categoryId: Number(categoryRows[0].category_id), locationId: Number(locationRows[0].location_id), eventDate: '2026-10-01', color: null };
    await t.test('unauthenticated and USER access are denied; ADMIN dashboard and paged safe user APIs work', async () => {
      assert.equal((await request(http, '/api/admin/dashboard')).status, 401);
      assert.equal((await api('/dashboard', user.token)).status, 403);
      const dashboard = await api('/dashboard'); assert.equal(dashboard.status, 200); assert.ok('users' in dashboard.json.data && 'matches' in dashboard.json.data && 'recentActivity' in dashboard.json.data);
      const [[counts]] = await query(pool, "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM items WHERE type='LOST') AS lost, (SELECT COUNT(*) FROM items WHERE type='FOUND') AS found, (SELECT COUNT(*) FROM items WHERE status='RETURNED') AS returned, (SELECT COUNT(*) FROM claims) AS claims, (SELECT COUNT(*) FROM matches) AS matches, (SELECT COUNT(*) FROM reports) AS reports");
      assert.deepEqual([dashboard.json.data.users.total, dashboard.json.data.items.total, dashboard.json.data.items.lost, dashboard.json.data.items.found, dashboard.json.data.items.returned, dashboard.json.data.claims.total, dashboard.json.data.matches.total, dashboard.json.data.reports.total], Object.values(counts).map(Number));
      const list = await api('/users?page=1&limit=1'); assert.equal(list.status, 200); assert.equal(list.json.pagination.limit, 1); assert.equal(list.json.data.length, 1);
      assert.equal(JSON.stringify(list.json).includes('password_hash'), false);
      assert.equal((await api('/users/invalid')).status, 400); assert.equal((await api('/users?unexpected=1')).status, 400);
    });
    await t.test('user suspension is audited and applies immediately to existing JWT; no self-suspension or role escalation', async () => {
      const result = await api(`/users/${user.user.id}/status`, admin.token, { method: 'PATCH', body: { status: 'SUSPENDED' } });
      assert.equal(result.status, 200); assert.equal(result.json.data.accountStatus, 'SUSPENDED');
      assert.equal((await request(http, '/api/users/me', { token: user.token })).status, 403);
      const [[audit]] = await query(pool, "SELECT action, details FROM activity_logs WHERE action='USER_STATUS_CHANGED' ORDER BY log_id DESC LIMIT 1");
      assert.equal(audit.action, 'USER_STATUS_CHANGED'); assert.equal((typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details).status, 'SUSPENDED');
      assert.equal((await api(`/users/${admin.user.id}/status`, admin.token, { method: 'PATCH', body: { status: 'SUSPENDED' } })).status, 409);
      assert.equal((await api(`/users/${user.user.id}/status`, admin.token, { method: 'PATCH', body: { status: 'ACTIVE', role: 'ADMIN' } })).status, 400);
    });
    await t.test('admin item inspection and OPEN to CLOSED moderation use item audit; claim-pending item cannot be moderated', async () => {
      const item = await items.create({ id: user.user.id, role: 'USER' }, input);
      const listed = await api(`/items?status=OPEN`); assert.equal(listed.status, 200); assert.ok(listed.json.data.some((row) => row.id === item.id));
      assert.equal((await api(`/items/${item.id}`)).status, 200);
      const closed = await api(`/items/${item.id}/status`, admin.token, { method: 'PATCH', body: { status: 'CLOSED' } }); assert.equal(closed.status, 200); assert.equal(closed.json.data.status, 'CLOSED');
      assert.equal((await api(`/items/${item.id}/status`, admin.token, { method: 'PATCH', body: { status: 'OPEN' } })).status, 400);
      const [[itemAudit]] = await query(pool, "SELECT action, details FROM activity_logs WHERE entity_type='ITEM' AND entity_id=? ORDER BY log_id DESC LIMIT 1", [item.id]); assert.equal(itemAudit.action, 'ITEM_MODERATED_CLOSED');
      const found = await items.create({ id: user.user.id, role: 'USER' }, { ...input, title: 'Found claim item', type: 'FOUND' });
      await claims.create({ id: admin.user.id, role: 'ADMIN' }, found.id, { proofDescription: 'private evidence' });
      assert.equal((await api(`/items/${found.id}/status`, admin.token, { method: 'PATCH', body: { status: 'CLOSED' } })).status, 400);
    });
    await t.test('category/location CRUD uses soft deletion, preserves referenced rows, and audits mutations', async () => {
      const category = await api('/categories', admin.token, { method: 'POST', body: { name: 'Phase6Category' } }); assert.equal(category.status, 201);
      assert.equal((await api('/categories', admin.token, { method: 'POST', body: { name: 'Phase6Category' } })).status, 409);
      const location = await api('/locations', admin.token, { method: 'POST', body: { name: 'Phase6Location' } }); assert.equal(location.status, 201);
      assert.equal((await api(`/categories/${category.json.data.id}`, admin.token, { method: 'PATCH', body: { name: 'Phase6CategoryRenamed' } })).status, 200);
      const referenced = await items.create({ id: admin.user.id, role: 'ADMIN' }, { ...input, categoryId: category.json.data.id, locationId: location.json.data.id });
      assert.equal((await api(`/categories/${category.json.data.id}`, admin.token, { method: 'DELETE' })).json.data.isActive, false);
      assert.equal((await api(`/locations/${location.json.data.id}`, admin.token, { method: 'DELETE' })).json.data.isActive, false);
      const [[row]] = await query(pool, 'SELECT category_id, location_id FROM items WHERE item_id=?', [referenced.id]);
      assert.equal(String(row.category_id), String(category.json.data.id)); assert.equal(String(row.location_id), String(location.json.data.id));
      const [audits] = await query(pool, "SELECT action FROM activity_logs WHERE (entity_type='CATEGORY' AND entity_id=?) OR (entity_type='LOCATION' AND entity_id=?) ORDER BY action", [category.json.data.id, location.json.data.id]); assert.deepEqual(audits.map((row) => row.action).sort(), ['CATEGORY_CREATED', 'CATEGORY_DISABLED', 'CATEGORY_UPDATED', 'LOCATION_CREATED', 'LOCATION_DISABLED'].sort());
      assert.equal((await api('/categories', user.token)).status, 403);
    });
    await t.test('admin report detail is protected and excludes Claim evidence', async () => {
      const made = await reports.create({ id: admin.user.id, role: 'ADMIN' }, { targetType: 'ITEM', targetId: (await items.create({ id: admin.user.id, role: 'ADMIN' }, input)).id, reason: 'spam' });
      const detail = await api(`/reports/${made.id}`); assert.equal(detail.status, 200); assert.equal(JSON.stringify(detail.json).includes('proof_description'), false);
      assert.equal((await api(`/reports/${made.id}`, user.token)).status, 403);
      assert.equal((await api(`/reports/${made.id}`, admin.token, { method: 'PATCH', body: { status: 'REVIEWING' } })).status, 200);
      assert.equal((await api(`/reports/${made.id}`, admin.token, { method: 'PATCH', body: { status: 'DISMISSED' } })).status, 200);
    });
    await t.test('lookup audit failures roll back both lookup and activity row', async () => {
      let fired = false;
      const faultyPool = { async getConnection() { const connection = await pool.getConnection(); return new Proxy(connection, { get(target, key) { if (key === 'query') return (sql, values) => { const text = typeof sql === 'string' ? sql : sql.sql; if (!fired && text.includes('INSERT INTO activity_logs')) { fired = true; return target.query("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='phase6 injected failure'"); } return target.query(sql, values); }; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } }); } };
      const failing = createAdminService(createAdminRepository(faultyPool), items);
      await assert.rejects(() => failing.createLookup({ id: admin.user.id }, 'categories', { name: 'MustRollback' }), (error) => error.code === 'ER_SIGNAL_EXCEPTION'); assert.equal(fired, true);
      const [[count]] = await query(pool, "SELECT COUNT(*) AS total FROM categories WHERE name='MustRollback'"); assert.equal(Number(count.total), 0);
    });
  } finally {
    if (http) await http.close(); if (pool) await pool.end();
    await connection.end().catch(() => {});
    if (created) {
      const cleanup = await connect(base, false);
      try {
        if (!/^findit_test_[a-f0-9]{24}$/.test(name)) throw new Error('Refusing unowned cleanup');
        await cleanup.query(`DROP DATABASE \`${name}\``);
      } finally { await cleanup.end(); }
    }
  }
});

