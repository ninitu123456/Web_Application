import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate, migrationFiles } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { quote, tables, metadata, createTable } from '../../database/schema.js';
import { phase5Alter } from '../../database/phase5-schema.js';
import { createDbPool, query } from '../config/db.js';
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
import { createUserRepository } from '../repositories/user.repository.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

test('Phase 5 integration: real notifications, reports, transactions and additive migration', { timeout: 180000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Run test:integration:isolated; production databases are forbidden');
  const base = configFromEnv(), owned = [];
  let connection = await connect(base, false);
  let pool, http;
  async function newDatabase() {
    const name = `findit_test_${randomBytes(12).toString('hex')}`;
    await connection.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    owned.push(name);
    // Prepared statements are bound to the schema at prepare time. Use a fresh
    // connection for each legacy fixture, never reuse cached statements via USE.
    await connection.end(); connection = await connect({ ...base, database: name });
    return name;
  }
  try {
    const [[instance]] = await connection.query('SELECT @@datadir AS directory, @@port AS port');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR)); assert.equal(Number(instance.port), base.port);
    const name = await newDatabase(); await migrate(connection, name);
    const password = randomBytes(18).toString('hex');
    await seed(connection, name, { USER: { email: 'owner@workflow.test', password }, ADMIN: { email: 'admin@workflow.test', password } });
    pool = createDbPool({ ...base, database: name });
    const users = createUserRepository(pool), auth = createAuthService(users, createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
    const items = createItemService(createItemRepository(pool)), claims = createClaimService(createClaimRepository(pool));
    const notifications = createNotificationService(createNotificationRepository(pool)), reports = createReportService(createReportRepository(pool));
    http = await serveApp(createApp({ healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users), itemService: items,
      matchingService: createMatchingService(createMatchingRepository(pool)), claimService: claims, notificationService: notifications, reportService: reports, logger: () => {} }));
    const accounts = {};
    for (const label of ['owner', 'admin', 'claimant', 'other']) {
      if (['claimant', 'other'].includes(label)) await auth.register({ fullName: label, email: `${label}@workflow.test`, password });
      const login = await auth.login({ email: `${label}@workflow.test`, password });
      accounts[label] = { token: login.token, id: String(login.user.id), role: login.user.role };
    }
    const { owner, admin, claimant, other } = accounts;
    const [categories] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id');
    const [locations] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id');
    async function makeItem(type = 'FOUND', identity = owner, changes = {}, service = items) {
      return service.create(identity, { type, title: 'workflow object', description: 'public matching description', color: null,
        categoryId: Number(categories[0].category_id), locationId: Number(locations[0].location_id), eventDate: '2026-01-01', ...changes });
    }
    const proof = `private-proof-${randomBytes(24).toString('hex')}`;
    const createClaim = (item, identity = claimant, service = claims) => service.create(identity, item.id, { proofDescription: proof });
    const eventRows = async (key) => (await query(pool, 'SELECT * FROM notifications WHERE event_key=? ORDER BY user_id', [key]))[0];
    const postReport = (body, identity = claimant) => request(http, '/api/reports', { method: 'POST', token: identity.token, body });
    const patchReport = (id, status, identity = admin) => request(http, `/api/admin/reports/${id}`, { method: 'PATCH', token: identity.token, body: { status } });
    async function snapshot() {
      const result = {};
      for (const table of tables) [result[table.name]] = await query(pool, `SELECT * FROM ${quote(table.name)} ORDER BY ${quote(table.pk)}`);
      return result;
    }
    function faultyPool(matches) {
      let injected = false;
      return { get injected() { return injected; }, async getConnection() {
        const target = await pool.getConnection();
        return new Proxy(target, { get(target, key) {
          if (key === 'query') return (statement, values) => {
            const sql = typeof statement === 'string' ? statement : statement.sql;
            if (!injected && matches(sql, values ?? [])) { injected = true; return target.query("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='phase5 injected failure'"); }
            return target.query(statement, values);
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
    }

    await t.test('new Match notifies both owners once; recompute preserves read state and same owner gets one notification', async () => {
      const lost = await makeItem('LOST', owner), found = await makeItem('FOUND', claimant);
      const [[match]] = await query(pool, 'SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, found.id]);
      const key = `NEW_MATCH:${match.match_id}`, rows = await eventRows(key);
      assert.deepEqual(rows.map((row) => String(row.user_id)).sort(), [owner.id, claimant.id].sort());
      assert.ok(rows.every((row) => row.is_read === 0));
      const mine = rows.find((row) => String(row.user_id) === owner.id);
      await notifications.markRead(owner, Number(mine.notification_id));
      const before = await eventRows(key);
      await items.update(owner, lost.id, { title: 'workflow object updated' });
      await notifications.emit('NEW_MATCH', match.match_id, [owner.id, claimant.id]);
      assert.deepEqual(await eventRows(key), before);
      const ownLost = await makeItem('LOST', other), ownFound = await makeItem('FOUND', other);
      const [[ownMatch]] = await query(pool, 'SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [ownLost.id, ownFound.id]);
      const selfRows = await eventRows(`NEW_MATCH:${ownMatch.match_id}`);
      assert.equal(selfRows.length, 1); assert.equal(String(selfRows[0].user_id), other.id);
    });

    await t.test('Matching threshold is unchanged: below/exact/above, rounding and no repeat after a score drop', async () => {
      const lost = await makeItem('LOST', owner, { title: 'uniquealpha', description: '', eventDate: '2026-01-01' });
      const below = await makeItem('FOUND', claimant, { title: 'uniquebeta', description: '', eventDate: '2026-01-31', categoryId: Number(categories[1].category_id) });
      assert.equal((await query(pool, 'SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, below.id]))[0].length, 0);
      const exact = await makeItem('FOUND', claimant, { title: 'uniquebeta', description: '', eventDate: '2026-01-31' });
      const [[match]] = await query(pool, 'SELECT match_id, match_score FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, exact.id]);
      assert.equal(Number(match.match_score), 50); assert.equal((await eventRows(`NEW_MATCH:${match.match_id}`)).length, 2);
      const above = await makeItem('FOUND', claimant, { title: 'uniquealpha', description: '', eventDate: '2026-01-31' });
      const [[higher]] = await query(pool, 'SELECT match_id, match_score FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, above.id]);
      assert.ok(Number(higher.match_score) > 50); assert.equal((await eventRows(`NEW_MATCH:${higher.match_id}`)).length, 2);
      const before = await eventRows(`NEW_MATCH:${match.match_id}`);
      await items.update(claimant, exact.id, { categoryId: Number(categories[1].category_id) });
      await items.update(claimant, exact.id, { categoryId: Number(categories[0].category_id) });
      assert.deepEqual(await eventRows(`NEW_MATCH:${match.match_id}`), before);
      // Base 40; Jaccard 2000/6001 adds 9.9983... and rounds up to 50.
      const many = (n) => Array.from({ length: n }, (_, index) => `v${index}`).join(' ');
      const roundLost = await makeItem('LOST', owner, { title: 'boundarymarker', description: many(1999) });
      const rounded = await makeItem('FOUND', claimant, { title: 'boundarymarker', description: many(6000), locationId: Number(locations[1].location_id), eventDate: '2026-01-16' });
      const [[roundMatch]] = await query(pool, 'SELECT match_id, match_score FROM matches WHERE lost_item_id=? AND found_item_id=?', [roundLost.id, rounded.id]);
      assert.equal(Number(roundMatch.match_score), 50); assert.equal((await eventRows(`NEW_MATCH:${roundMatch.match_id}`)).length, 2);
      const under = await makeItem('LOST', owner, { title: 'boundarymarker', description: many(1998) });
      assert.equal((await query(pool, 'SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [under.id, rounded.id]))[0].length, 0);
    });

    await t.test('Claim events include automatic competitor rejection and never expose proof in notifications', async () => {
      const found = await makeItem();
      const first = await createClaim(found), second = await createClaim(found, other);
      assert.equal(String((await eventRows(`NEW_CLAIM:${first.id}`))[0].user_id), owner.id);
      await claims.approve(owner, first.id);
      assert.equal(String((await eventRows(`CLAIM_APPROVED:${first.id}`))[0].user_id), claimant.id);
      assert.equal(String((await eventRows(`CLAIM_REJECTED:${second.id}`))[0].user_id), other.id);
      await claims.complete(owner, first.id);
      assert.equal(String((await eventRows(`CLAIM_COMPLETED:${first.id}`))[0].user_id), claimant.id);
      const rejected = await createClaim(await makeItem()); await claims.reject(owner, rejected.id);
      assert.equal((await eventRows(`CLAIM_REJECTED:${rejected.id}`)).length, 1);
      const response = await request(http, '/api/notifications', { token: claimant.token });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      const assertPrivate = (json) => { assert.equal(JSON.stringify(json).includes(proof), false); assert.equal(JSON.stringify(json).includes('proofDescription'), false); assert.equal(JSON.stringify(json).includes('event_key'), false); };
      assertPrivate(response.json); assert.throws(() => assertPrivate({ message: proof }));
      const [logs] = await query(pool, 'SELECT details FROM activity_logs'); assertPrivate(logs);
    });

    await t.test('real JWT ownership, idempotent mark-read, unread count, pagination and read-all', async () => {
      for (const [path, method] of [['/api/notifications', 'GET'], ['/api/notifications/unread-count', 'GET'], ['/api/notifications/read-all', 'PATCH'], ['/api/notifications/1/read', 'PATCH']]) assert.equal((await request(http, path, { method })).status, 401);
      const listing = await request(http, '/api/notifications?limit=1', { token: owner.token });
      assert.equal(listing.status, 200); assert.equal(listing.json.data.length, 1); assert.ok(listing.json.pagination.total > 1);
      const id = listing.json.data[0].id;
      assert.equal((await request(http, `/api/notifications/${id}/read`, { method: 'PATCH', token: other.token })).status, 403);
      for (let i = 0; i < 2; i++) assert.equal((await request(http, `/api/notifications/${id}/read`, { method: 'PATCH', token: owner.token })).status, 200);
      assert.equal((await request(http, '/api/notifications/9007199254740991/read', { method: 'PATCH', token: owner.token })).status, 404);
      assert.equal((await request(http, '/api/notifications?limit=101', { token: owner.token })).status, 400);
      const otherBefore = await notifications.unread(other);
      assert.equal((await request(http, '/api/notifications/read-all', { method: 'PATCH', token: owner.token })).status, 200);
      assert.deepEqual((await request(http, '/api/notifications/unread-count', { token: owner.token })).json.data, { unreadCount: 0 });
      assert.deepEqual(await notifications.unread(other), otherBefore);
      await notifications.emit('NEW_MATCH', '9000000', [owner.id]);
      assert.deepEqual(await notifications.unread(owner), { unreadCount: 1 });
    });

    await t.test('concurrent Match creation and duplicate Claim creation never duplicate notifications', async () => {
      const [lost, found] = await Promise.all([makeItem('LOST', other), makeItem('FOUND', claimant)]);
      const [[match]] = await query(pool, 'SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, found.id]);
      assert.equal((await eventRows(`NEW_MATCH:${match.match_id}`)).length, 2);
      const target = await makeItem();
      const created = await Promise.all([createClaim(target), createClaim(target)].map((promise) => promise.then((data) => ({ status: 201, data }), (error) => ({ status: error.status }))));
      assert.deepEqual(created.map((value) => value.status).sort(), [201, 409]);
      const id = created.find((value) => value.status === 201).data.id;
      assert.equal((await eventRows(`NEW_CLAIM:${id}`)).length, 1);
    });

    for (const event of ['NEW_MATCH', 'NEW_CLAIM', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'AUTO_REJECT', 'CLAIM_COMPLETED']) {
      await t.test(`${event}: notification SQL failure rolls back business data, notifications and audit`, async () => {
        const target = await makeItem(); let claim;
        if (!['NEW_MATCH', 'NEW_CLAIM'].includes(event)) claim = await createClaim(target);
        if (event === 'AUTO_REJECT') await createClaim(target, other);
        if (event === 'CLAIM_COMPLETED') await claims.approve(owner, claim.id);
        if (event === 'NEW_MATCH') await makeItem('LOST', claimant);
        let matchingInserts = 0;
        const faulty = faultyPool((sql, values) => sql.startsWith('INSERT INTO notifications') &&
          (event === 'NEW_MATCH' ? values[1] === 'NEW_MATCH' && ++matchingInserts === 2 : values[1] === (event === 'AUTO_REJECT' ? 'CLAIM_REJECTED' : event)));
        const badClaims = createClaimService(createClaimRepository(faulty));
        const before = await snapshot();
        await assert.rejects(async () => {
          if (event === 'NEW_MATCH') await makeItem('FOUND', other, {}, createItemService(createItemRepository(faulty)));
          else if (event === 'NEW_CLAIM') await createClaim(target, claimant, badClaims);
          else if (event === 'CLAIM_REJECTED') await badClaims.reject(owner, claim.id);
          else if (event === 'CLAIM_COMPLETED') await badClaims.complete(owner, claim.id);
          else await badClaims.approve(owner, claim.id);
        }, (error) => error.code === 'ER_SIGNAL_EXCEPTION');
        assert.equal(faulty.injected, true); assert.deepEqual(await snapshot(), before);
      });
    }

    await t.test('Report validation, private Claim targets, USER admin denial and own report list', async () => {
      const item = await makeItem(), claim = await createClaim(item);
      const valid = { targetType: 'ITEM', targetId: item.id, reason: 'incorrect info' };
      assert.equal((await request(http, '/api/reports', { method: 'POST', body: valid })).status, 401);
      for (const body of [{ ...valid, reporterId: 9 }, { ...valid, targetId: 0 }, { ...valid, targetType: 'BAD' }, { ...valid, reason: ' ' }]) assert.equal((await postReport(body)).status, 400);
      assert.equal((await postReport({ ...valid, targetId: 9007199254740991 })).status, 404);
      assert.equal((await postReport({ targetType: 'CLAIM', targetId: claim.id, reason: 'fraud' }, other)).status, 403);
      for (const identity of [claimant, owner, admin]) assert.equal((await postReport({ targetType: 'CLAIM', targetId: claim.id, reason: 'fraud' }, identity)).status, 201);
      const userReport = await postReport({ targetType: 'USER', targetId: Number(owner.id), reason: 'spam' });
      assert.equal(userReport.status, 201); assert.equal(userReport.json.data.status, 'PENDING');
      assert.equal((await request(http, '/api/admin/reports', { token: claimant.token })).status, 403);
      assert.equal((await patchReport(userReport.json.data.id, 'REVIEWING', claimant)).status, 403);
      const mine = await request(http, '/api/reports/mine', { token: claimant.token });
      assert.equal(mine.status, 200); assert.ok(mine.json.data.length > 0);
      assert.ok(mine.json.data.every((row) => row.reporterId === Number(claimant.id)));
      assert.equal(JSON.stringify(mine.json).includes(proof), false);
      assert.throws(() => assert.equal(JSON.stringify({ ...mine.json, leaked: proof }).includes(proof), false));
      const list = await request(http, '/api/admin/reports?status=PENDING&limit=1', { token: admin.token });
      assert.equal(list.status, 200); assert.equal(list.json.data.length, 1); assert.ok(list.json.pagination.total > 1);
      assert.equal((await request(http, '/api/admin/reports?status=INVALID', { token: admin.token })).status, 400);
    });

    for (const terminal of ['RESOLVED', 'DISMISSED']) {
      await t.test(`Report duplicates are blocked only while open; ${terminal} allows resubmission`, async () => {
        const item = await makeItem(), body = { targetType: 'ITEM', targetId: item.id, reason: 'spam' };
        const created = await Promise.all([postReport(body), postReport(body)]);
        assert.deepEqual(created.map((value) => value.status).sort(), [201, 409]);
        const id = created.find((value) => value.status === 201).json.data.id;
        assert.equal((await patchReport(id, terminal)).status, 409);
        assert.equal((await patchReport(id, 'REVIEWING')).status, 200);
        assert.equal((await postReport({ ...body, reason: 'another reason' })).status, 409);
        assert.equal((await patchReport(id, terminal)).status, 200);
        assert.equal((await patchReport(id, terminal)).status, 409);
        assert.equal((await patchReport(id, 'REVIEWING')).status, 409);
        assert.equal((await postReport(body)).status, 201);
        const [[row]] = await query(pool, 'SELECT reviewed_by, reviewed_at, active_target_key FROM reports WHERE report_id=?', [id]);
        assert.equal(String(row.reviewed_by), admin.id); assert.ok(row.reviewed_at); assert.equal(row.active_target_key, null);
        assert.equal((await query(pool, 'SELECT status FROM items WHERE item_id=?', [item.id]))[0][0].status, 'OPEN');
      });
    }

    await t.test('concurrent terminal Report decisions have one winner and one audit; SQL audit failure rolls back reviewer/status', async () => {
      const body = { targetType: 'ITEM', targetId: (await makeItem()).id, reason: 'spam' };
      const made = await postReport(body), id = made.json.data.id;
      const faulty = faultyPool((sql) => sql.startsWith('INSERT INTO activity_logs'));
      const badReports = createReportService(createReportRepository(faulty));
      const before = await snapshot();
      await assert.rejects(() => badReports.update(admin, id, { status: 'REVIEWING' }), (error) => error.code === 'ER_SIGNAL_EXCEPTION');
      assert.deepEqual(await snapshot(), before);
      await reports.update(admin, id, { status: 'REVIEWING' });
      const results = await Promise.all([patchReport(id, 'RESOLVED'), patchReport(id, 'DISMISSED')]);
      assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
      const [audit] = await query(pool, "SELECT details FROM activity_logs WHERE entity_type='REPORT' AND entity_id=? ORDER BY log_id", [id]);
      assert.equal(audit.length, 2);
      const [[row]] = await query(pool, 'SELECT status FROM reports WHERE report_id=?', [id]);
      assert.equal(JSON.parse(typeof audit[1].details === 'string' ? audit[1].details : JSON.stringify(audit[1].details)).status, row.status);
    });

    await t.test('Report create readback SQL failure rolls back the inserted Report', async () => {
      const body = { targetType: 'ITEM', targetId: (await makeItem()).id, reason: 'spam' };
      const faulty = faultyPool((sql) => sql.includes('FROM reports WHERE report_id=LAST_INSERT_ID()'));
      const before = await snapshot();
      await assert.rejects(() => createReportService(createReportRepository(faulty)).create(claimant, body), (error) => error.code === 'ER_SIGNAL_EXCEPTION');
      assert.equal(faulty.injected, true); assert.deepEqual(await snapshot(), before);
      assert.equal((await postReport(body)).status, 201);
    });
    for (const status of ['RESOLVED', 'DISMISSED']) {
      await t.test(`Report ${status} audit failure preserves open duplicate protection and all original data`, async () => {
        const body = { targetType: 'ITEM', targetId: (await makeItem()).id, reason: 'spam' };
        const made = await postReport(body), id = made.json.data.id;
        await reports.update(admin, id, { status: 'REVIEWING' });
        const before = await snapshot(), faulty = faultyPool((sql) => sql.startsWith('INSERT INTO activity_logs'));
        await assert.rejects(() => createReportService(createReportRepository(faulty)).update(admin, id, { status }), (error) => error.code === 'ER_SIGNAL_EXCEPTION');
        assert.equal(faulty.injected, true); assert.deepEqual(await snapshot(), before);
        assert.equal((await postReport(body)).status, 409);
      });
    }

    await t.test('migration upgrades schema 12 with data, resumes between ALTERs, and rejects malformed shape or open duplicates', async () => {
      const files = await migrationFiles();
      async function legacy() {
        const database = await newDatabase(); await connection.query(createTable(metadata));
        for (const file of files.slice(0, 12)) {
          if (file.kind === 'index') for (const index of file.indexes) await connection.query(index.sql);
          else await connection.query(file.sql);
          await connection.execute("INSERT INTO _schema_migrations (version, checksum, status, started_at, applied_at) VALUES (?, ?, 'applied', UTC_TIMESTAMP(), UTC_TIMESTAMP())", [file.version, file.checksum]);
        }
        // Current seed verifies migration 13, so build a real v12 fixture from
        // the isolated baseline's lookup/account/seed Item rows instead.
        for (const tableName of ['roles', 'categories', 'locations', 'users', 'items']) {
          const table = tables.find((entry) => entry.name === tableName), names = Object.keys(table.columns).map(quote).join(',');
          const [rows] = await query(pool, `SELECT ${names} FROM ${quote(tableName)}${tableName === 'items' ? ' WHERE item_id<=4' : ''}`);
          for (const row of rows) await connection.execute(`INSERT INTO ${quote(tableName)} (${names}) VALUES (${Object.keys(row).map(() => '?').join(',')})`, Object.values(row));
        }
        await connection.query("INSERT INTO notifications (user_id,type,message,created_at) SELECT user_id,'NEW_MATCH','legacy notification',UTC_TIMESTAMP() FROM users ORDER BY user_id LIMIT 1");
        await connection.query("INSERT INTO reports (reporter_id,target_type,item_id,reason,created_at) SELECT user_id,'ITEM',item_id,'legacy report',UTC_TIMESTAMP() FROM items ORDER BY item_id LIMIT 1");
        return database;
      }
      const database = await legacy();
      const [oldNotifications] = await connection.query('SELECT notification_id,user_id,type,message,is_read,created_at FROM notifications');
      const [oldReports] = await connection.query('SELECT report_id,reporter_id,target_type,item_id,reason,status,created_at FROM reports');
      const last = files.find((file) => file.version === '013_notification_report_support.sql');
      const proxy = new Proxy(connection, { get(target, key) {
        if (key === 'query') return (sql, values) => {
          if (typeof sql === 'string' && sql.startsWith('ALTER TABLE `reports`')) throw new Error('interrupted between ALTERs');
          return target.query(sql, values);
        };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
      await assert.rejects(() => migrate(proxy, database), /interrupted between ALTERs/);
      assert.equal((await connection.query('SHOW COLUMNS FROM notifications LIKE \'event_key\''))[0].length, 1);
      assert.equal((await connection.query('SHOW COLUMNS FROM reports LIKE \'active_target_key\''))[0].length, 0);
      assert.equal(await migrate(connection, database), 13); assert.equal(await migrate(connection, database), 0);
      assert.deepEqual((await connection.query('SELECT notification_id,user_id,type,message,is_read,created_at FROM notifications'))[0], oldNotifications);
      assert.deepEqual((await connection.query('SELECT report_id,reporter_id,target_type,item_id,reason,status,created_at FROM reports'))[0], oldReports);
      await connection.query('ALTER TABLE notifications DROP INDEX uq_notifications_user_event');
      await assert.rejects(() => migrate(connection, database), /Schema mismatch/);
      const duplicateDb = await legacy();
      await connection.query('INSERT INTO reports (reporter_id,target_type,item_id,reason,created_at) SELECT reporter_id,target_type,item_id,reason,created_at FROM reports');
      await assert.rejects(() => migrate(connection, duplicateDb), /Duplicate open Reports/);
      assert.equal((await connection.query('SELECT * FROM reports'))[0].length, 2);
      assert.equal((await connection.query('SHOW COLUMNS FROM notifications LIKE \'event_key\''))[0].length, 0);
      await connection.query("UPDATE reports SET status='DISMISSED'");
      assert.equal(await migrate(connection, duplicateDb), 13);
      assert.equal((await connection.query("SELECT * FROM reports WHERE active_target_key IS NULL"))[0].length, 2);
      assert.equal(last.version, '013_notification_report_support.sql');
      assert.ok(phase5Alter('reports').includes('active_target_key'));
    });
  } finally {
    if (http) await http.close(); if (pool) await pool.end();
    try {
      for (const name of owned) {
        assert.match(name, /^findit_test_[a-f0-9]{24}$/);
        await connection.query(`DROP DATABASE ${quote(name)}`);
      }
    } finally { await connection.end(); }
  }
});
