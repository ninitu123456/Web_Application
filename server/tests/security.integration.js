import { assertIsolatedInstance, assertOwnedDatabase } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { allMatches } from './helpers.js';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { tables, quote } from '../../database/schema.js';
import { createDbPool, query } from '../config/db.js';
import { createApp } from '../app.js';
import { createTokenService } from '../utils/jwt.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createNotificationRepository } from '../repositories/notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';
import { createReportRepository } from '../repositories/report.repository.js';
import { createReportService } from '../services/report.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createAdminService } from '../services/admin.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { serveApp, request } from './auth/helpers.js';
import { protectedRoutes, assertNoPrivateData } from './fixtures/security.js';

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Concurrency barrier was not reached')), 5000); })]); }
  finally { clearTimeout(timer); }
}
// Both transactions must reach the chosen SQL boundary before either can execute it.
function barrierPool(pool, predicate) {
  const ready = deferred(); let arrivals = 0;
  return { get arrivals() { return arrivals; }, async getConnection() {
    const connection = await pool.getConnection();
    return new Proxy(connection, { get(target, key) {
      if (key === 'query') return async (statement, values) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (predicate(sql) && arrivals < 2) { if (++arrivals === 2) ready.resolve(); await bounded(ready.promise); }
        return target.query(statement, values);
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}

test('Phase 7 real HTTP/JWT/MySQL: authorization, injection, upload, rollback and five controlled race rounds', { timeout: 180000 }, async (t) => {
  const base = configFromEnv(), name = `findit_test_${randomBytes(12).toString('hex')}`;
  const connection = await connect(base, false);
  let created = false, pool, http;
  try {
    await connection.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await connection.query(`USE ${quote(name)}`); await migrate(connection, name);
    const password = randomBytes(18).toString('hex');
    await seed(connection, name, { USER: { email: 'owner@security.test', password }, ADMIN: { email: 'admin@security.test', password } });
    pool = createDbPool({ ...base, database: name });
    const users = createUserRepository(pool), tokens = createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 });
    const auth = createAuthService(users, tokens), assets = new Map(); let uploadCalls = 0, failUpload = 0;
    const storage = { async upload(buffer, type, publicId) {
      assets.set(publicId, buffer); uploadCalls++;
      if (failUpload && uploadCalls === failUpload) throw Object.assign(new Error('mock cloud timeout'), { code: 'ETIMEDOUT' });
      return { publicId, url: `https://mock.invalid/${publicId}.png` };
    }, async destroy(publicId) { assets.delete(publicId); } };
    const items = createItemService(createItemRepository(pool), storage, createImageOperations(pool, storage, () => {}));
    const matching = createMatchingService(createMatchingRepository(pool));
    const claims = createClaimService(createClaimRepository(pool));
    const notifications = createNotificationService(createNotificationRepository(pool));
    const reports = createReportService(createReportRepository(pool));
    const adminService = createAdminService(createAdminRepository(pool), items);
    http = await serveApp(createApp({ healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users),
      itemService: items, matchingService: matching, claimService: claims, notificationService: notifications, reportService: reports, adminService,
      security: { apiMax: 10000, uploadMax: 100 }, logger: () => {} }));
    const accounts = {};
    for (const label of ['owner', 'admin', 'claimant', 'other']) {
      if (['claimant', 'other'].includes(label)) assert.equal((await request(http, '/api/auth/register', { method: 'POST', body: { fullName: label, email: `${label}@security.test`, password } })).status, 201);
      const login = await request(http, '/api/auth/login', { method: 'POST', body: { email: `${label}@security.test`, password } });
      assert.equal(login.status, 200);
      accounts[label] = { id: String(login.json.data.user.id), role: login.json.data.user.role, token: login.json.data.token };
    }
    const { owner, admin, claimant, other } = accounts;
    const [[category]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
    const input = { type: 'FOUND', title: 'phase7 object', description: 'public description', color: null, categoryId: Number(category.category_id), locationId: Number(location.location_id), eventDate: '2026-10-20' };
    const makeItem = (changes = {}, identity = owner) => items.create(identity, { ...input, ...changes });
    const makeClaim = (item, identity = claimant) => claims.create(identity, item.id, { proofDescription: 'phase7-secret-proof' });
    const snapshot = async () => {
      const value = {};
      for (const table of tables) value[table.name] = (await query(pool, `SELECT * FROM ${quote(table.name)} ORDER BY ${quote(table.pk)}`))[0];
      return value;
    };
    const eventRows = async (eventKey) => (await query(pool, 'SELECT * FROM notifications WHERE event_key=? ORDER BY user_id', [eventKey]))[0];
    const send = (path, identity, options = {}) => request(http, path, { token: identity?.token, ...options });

    await t.test('real route matrix: anonymous, invalid JWT, USER Admin denial, suspension and no denied-request writes', async () => {
      const before = await snapshot();
      for (const [method, path, body] of protectedRoutes) {
        assert.equal((await send('/api' + path, null, { method, body })).status, 401, `${method} ${path}`);
        assert.equal((await request(http, '/api' + path, { method, body, token: 'broken' })).status, 401);
        if (path.startsWith('/admin/')) assert.equal((await send('/api' + path, other, { method, body })).status, 403);
      }
      assert.deepEqual(await snapshot(), before);
      await adminService.setUserStatus(admin, other.id, 'SUSPENDED');
      for (const [method, path, body] of protectedRoutes) assert.equal((await send('/api' + path, other, { method, body })).status, 403);
      await adminService.setUserStatus(admin, other.id, 'ACTIVE');
      assert.equal((await send('/api/users/me', other)).status, 200);
    });

    await t.test('IDOR denies foreign Item/image mutations including ADMIN without DB or cloud changes', async () => {
      const item = await makeItem(), another = await makeItem({}, other);
      const [image] = await query(pool, 'INSERT INTO item_images(item_id,image_url,created_at) VALUES (?, ?, UTC_TIMESTAMP())', [another.id, 'https://mock.invalid/foreign.png']);
      const before = await snapshot(), cloudBefore = uploadCalls;
      for (const identity of [other, admin]) {
        for (const [method, path, body] of [['PATCH', `/api/items/${item.id}`, { title: 'hijacked' }], ['PATCH', `/api/items/${item.id}/close`], ['DELETE', `/api/items/${item.id}/images/${image.insertId}`]]) {
          if (identity === admin && path.endsWith('/close')) continue; // Existing moderation permission.
          assert.equal((await send(path, identity, { method, body })).status, 403);
        }
        const form = new FormData(); form.append('images', new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'safe.png');
        assert.equal((await fetch(http.url + `/api/items/${item.id}/images`, { method: 'POST', headers: { Authorization: `Bearer ${identity.token}` }, body: form })).status, 403);
      }
      assert.equal((await send(`/api/items/${item.id}/images/${image.insertId}`, owner, { method: 'DELETE' })).status, 404);
      assert.equal(uploadCalls, cloudBefore); assert.deepEqual(await snapshot(), before);
      assert.equal((await send(`/api/items/${item.id}/matches`, other)).status, 200);
    });

    await t.test('SQLi payloads remain values on real MySQL; search dates, tie sorting, pagination and malformed query are bounded', async () => {
      const a = await makeItem({ title: 'phase7-search alpha', eventDate: '2026-02-28' });
      const b = await makeItem({ title: 'phase7-search beta', eventDate: '2026-02-28' });
      const c = await makeItem({ title: 'phase7-search gamma', eventDate: '2026-03-01' });
      await query(pool, "UPDATE items SET created_at='2026-10-20 00:00:00' WHERE item_id IN (?, ?, ?)", [a.id, b.id, c.id]);
      const before = await snapshot();
      for (const payload of ["' OR 1=1 --", "'; DROP TABLE users; --", "' UNION SELECT password_hash FROM users --", "' AND SLEEP(2) --"]) {
        const res = await request(http, '/api/items?keyword=' + encodeURIComponent(payload));
        assert.equal(res.status, 200); assert.deepEqual(res.json.data, []);
        assert.equal((await request(http, '/api/auth/login', { method: 'POST', body: { email: `a${payload.replaceAll(' ', '')}@example.test`, password } })).status, 401);
      }
      for (const [sort, ids] of [['newest', [c.id, b.id, a.id]], ['oldest', [a.id, b.id, c.id]], ['eventDateAsc', [a.id, b.id, c.id]], ['eventDateDesc', [c.id, b.id, a.id]]]) {
        const res = await request(http, `/api/items?keyword=phase7-search&sort=${sort}`);
        assert.deepEqual(res.json.data.map((row) => row.id), ids);
      }
      const boundary = await request(http, '/api/items?keyword=phase7-search&dateFrom=2026-02-28&dateTo=2026-02-28');
      assert.equal(boundary.json.pagination.total, 2);
      const empty = await request(http, '/api/items?keyword=phase7-search&page=999'); assert.deepEqual(empty.json.data, []); assert.equal(empty.json.pagination.total, 3);
      for (const queryString of ['keyword=a&keyword=b', 'page[]=1', 'page[x]=1', 'sort=title%3BDROP', 'dateFrom=2026-02-30', 'limit=101', 'page=9007199254740991&limit=100']) assert.equal((await request(http, '/api/items?' + queryString)).status, 400);
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('HTTP workflow preserves evidence privacy, inert XSS JSON and historical Matching after RETURNED', async () => {
      const xss = '<script>alert(1)</script>';
      const lost = await makeItem({ type: 'LOST', title: xss }, claimant);
      const found = await makeItem({ title: xss });
      await query(pool, 'UPDATE items SET private_identifiers=? WHERE item_id=?', ['phase7-private-serial', found.id]);
      const claimResponse = await send(`/api/items/${found.id}/claims`, claimant, { method: 'POST', body: { proofDescription: 'phase7-secret-proof' } });
      assert.equal(claimResponse.status, 201); const claim = claimResponse.json.data;
      assert.equal((await send(`/api/items/${found.id}/claims`, other)).status, 403);
      assert.equal((await send(`/api/items/${found.id}/claims`, admin)).json.data[0].proofDescription, 'phase7-secret-proof');
      for (const path of [`/api/items/${found.id}`, '/api/items?keyword=' + encodeURIComponent(xss), `/api/items/${lost.id}/matches`, '/api/notifications']) {
        const res = await send(path, claimant); assert.equal(res.status, 200); assertNoPrivateData(assert, res.json, ['phase7-secret-proof', 'phase7-private-serial']);
        assert.match(res.headers.get('content-type'), /^application\/json/); assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      }
      assert.equal((await request(http, `/api/items/${found.id}`)).json.data.title, xss);
      const matchesBefore = (await allMatches(matching, lost.id)); assert.ok(matchesBefore.some((m) => m.itemId === found.id));
      assert.equal((await send(`/api/claims/${claim.id}/approve`, other, { method: 'PATCH' })).status, 403);
      assert.equal((await send(`/api/claims/${claim.id}/approve`, admin, { method: 'PATCH' })).status, 403);
      assert.equal((await send(`/api/claims/${claim.id}/approve`, owner, { method: 'PATCH' })).status, 200);
      assert.equal((await send(`/api/claims/${claim.id}/complete`, owner, { method: 'PATCH' })).status, 200);
      assert.ok(!(await allMatches(matching, lost.id)).some((m) => m.itemId === found.id));
      assert.equal(Number((await query(pool, 'SELECT COUNT(*) AS total FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, found.id]))[0][0].total), 1);
      const report = await send('/api/reports', claimant, { method: 'POST', body: { targetType: 'ITEM', targetId: found.id, reason: xss, description: "'; DROP TABLE claims; --" } });
      assert.equal(report.status, 201); assert.equal(report.json.data.reason, xss);
      const reportId = report.json.data.id;
      for (const status of ['REVIEWING', 'RESOLVED']) assert.equal((await send(`/api/admin/reports/${reportId}`, admin, { method: 'PATCH', body: { status } })).status, 200);
      assert.equal((await items.get(found.id)).status, 'RETURNED');
      assert.equal((await eventRows(`CLAIM_COMPLETED:${claim.id}`)).length, 1);
      const notification = (await eventRows(`NEW_CLAIM:${claim.id}`))[0];
      assert.equal((await send(`/api/notifications/${notification.notification_id}/read`, admin, { method: 'PATCH' })).status, 403);
    });

    await t.test('Report target types keep distinct duplicate keys even for equal numeric target IDs', async () => {
      // First Claim belongs to owner/claimant; seeded Item/User IDs include 1.
      const [[first]] = await query(pool, 'SELECT claim_id FROM claims ORDER BY claim_id LIMIT 1');
      assert.equal(Number(first.claim_id), 1);
      for (const targetType of ['ITEM', 'USER', 'CLAIM']) {
        const body = { targetType, targetId: 1, reason: 'phase7 target test' };
        const res = await send('/api/reports', owner, { method: 'POST', body });
        assert.equal(res.status, 201, targetType);
        assert.equal((await send('/api/reports', owner, { method: 'POST', body })).status, 409);
      }
      const before = await snapshot();
      for (const body of [{ targetType: 'ITEM', targetId: 1, reason: 'x'.repeat(51) }, { targetType: 'USER', targetId: 9007199254740991, reason: 'x' }, { targetType: 'CLAIM', targetId: 1, reason: 'x', reviewedBy: Number(admin.id) }]) {
        assert.ok([400, 404].includes((await send('/api/reports', other, { method: 'POST', body })).status));
      }
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('upload MIME/content rejection and partial cloud timeout leave no rows or mock assets', async () => {
      const item = await makeItem();
      const upload = (files) => {
        const body = new FormData(); for (const [bytes, type, filename] of files) body.append('images', new Blob([bytes], { type }), filename);
        return fetch(http.url + `/api/items/${item.id}/images`, { method: 'POST', headers: { Authorization: `Bearer ${owner.token}` }, body });
      };
      const callsBefore = uploadCalls;
      for (const [bytes, type] of [['', 'image/png'], ['<html>x</html>', 'image/png'], ['<svg/>', 'image/svg+xml'], ['GIF89a', 'image/jpeg']]) assert.equal((await upload([[bytes, type, 'spoof.png']])).status, 400);
      assert.equal(uploadCalls, callsBefore);
      const png = new Uint8Array([137,80,78,71,13,10,26,10]);
      failUpload = uploadCalls + 2;
      const response = await upload([[png, 'image/png', '../../odd.png'], [png, 'image/png', 'second.png']]);
      assert.equal(response.status, 500); assertNoPrivateData(assert, await response.json());
      assert.equal((await items.get(item.id)).images.length, 0); assert.equal(assets.size, 0);
      failUpload = 0;
      assert.equal((await upload([[png, 'image/png', '../../odd.png']])).status, 201);
      const image = (await items.get(item.id)).images[0];
      assert.match(image.url, /^https:\/\/mock.invalid\/findit\/items\/[a-f0-9-]+\.png$/);
      assert.equal((await send(`/api/items/${item.id}/images/${image.id}`, owner, { method: 'DELETE' })).status, 200);
      assert.equal(assets.size, 0);
    });

    function faultyAdmin() {
      let fired = false;
      const faulty = { async getConnection() { const conn = await pool.getConnection(); return new Proxy(conn, { get(target, key) {
        if (key === 'query') return (sql, values) => {
          const text = typeof sql === 'string' ? sql : sql.sql;
          if (!fired && text.startsWith('INSERT INTO activity_logs')) { fired = true; return target.query("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='phase7 audit failure'"); }
          return target.query(sql, values);
        };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }); } };
      return { service: createAdminService(createAdminRepository(faulty), items), fired: () => fired };
    }
    await t.test('user status and both lookup updates/deactivations roll back with audit; no-op changes add no audit', async () => {
      const fixtures = {};
      for (const kind of ['categories', 'locations']) fixtures[kind] = await adminService.createLookup(admin, kind, { name: `phase7-${kind}` });
      const operations = [(service) => service.setUserStatus(admin, other.id, 'SUSPENDED')];
      for (const kind of ['categories', 'locations']) {
        operations.push((service) => service.updateLookup(admin, kind, fixtures[kind].id, { name: `phase7-${kind}-changed` }));
        operations.push((service) => service.updateLookup(admin, kind, fixtures[kind].id, {}, true));
      }
      for (const operation of operations) {
        const before = await snapshot(), faulty = faultyAdmin();
        await assert.rejects(() => operation(faulty.service), (e) => e.code === 'ER_SIGNAL_EXCEPTION');
        assert.equal(faulty.fired(), true); assert.deepEqual(await snapshot(), before);
      }
      const before = await snapshot();
      await adminService.setUserStatus(admin, other.id, 'ACTIVE');
      for (const kind of ['categories', 'locations']) await adminService.updateLookup(admin, kind, fixtures[kind].id, { name: `phase7-${kind}`, isActive: true });
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('lost real COMMIT response never replays a Report and leaves one atomic persisted record', async () => {
      let commits = 0, destroyed = 0;
      const faulty = { async getConnection() { const conn = await pool.getConnection(); return new Proxy(conn, { get(target, key) {
        if (key === 'commit') return async () => { commits++; await target.commit(); throw new Error('COMMIT response lost'); };
        if (key === 'destroy') return () => { destroyed++; target.destroy(); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }); } };
      const target = await makeItem();
      await assert.rejects(() => createReportService(createReportRepository(faulty)).create(other, { targetType: 'ITEM', targetId: target.id, reason: 'ambiguous commit' }), /response lost/);
      assert.equal(commits, 1); assert.equal(destroyed, 1);
      const [rows] = await query(pool, 'SELECT * FROM reports WHERE item_id=? AND reporter_id=?', [target.id, other.id]);
      assert.equal(rows.length, 1); assert.equal(rows[0].status, 'PENDING');
    });

    for (let round = 1; round <= 5; round++) {
      await t.test(`race round ${round}: approve/reject, complete/complete, create/approve, duplicate lookup and notification ordering`, async () => {
        const lockedItem = (sql) => sql.startsWith('SELECT item_id FROM items') && sql.endsWith('FOR UPDATE');
        const target = await makeItem(), first = await makeClaim(target);
        let concurrent = barrierPool(pool, lockedItem);
        let service = createClaimService(createClaimRepository(concurrent));
        const decisions = await Promise.allSettled([service.approve(owner, first.id), service.reject(owner, first.id)]);
        assert.equal(concurrent.arrivals, 2); assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(decisions.find((r) => r.status === 'rejected').reason.status, 409);
        const [[decision]] = await query(pool, 'SELECT status FROM claims WHERE claim_id=?', [first.id]);
        assert.equal((await items.get(target.id)).status, decision.status === 'APPROVED' ? 'CLAIMED' : 'OPEN');
        assert.equal((await eventRows(`CLAIM_${decision.status}:${first.id}`)).length, 1);

        const completedItem = await makeItem(), completion = await makeClaim(completedItem); await claims.approve(owner, completion.id);
        concurrent = barrierPool(pool, lockedItem); service = createClaimService(createClaimRepository(concurrent));
        const completions = await Promise.allSettled([service.complete(owner, completion.id), service.complete(owner, completion.id)]);
        assert.equal(concurrent.arrivals, 2); assert.equal(completions.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(completions.find((r) => r.status === 'rejected').reason.status, 409);
        assert.equal((await items.get(completedItem.id)).status, 'RETURNED'); assert.equal((await eventRows(`CLAIM_COMPLETED:${completion.id}`)).length, 1);
        assert.equal(Number((await query(pool, "SELECT COUNT(*) AS total FROM activity_logs WHERE action='CLAIM_COMPLETED' AND entity_id=?", [completion.id]))[0][0].total), 1);

        const raceItem = await makeItem(), winner = await makeClaim(raceItem);
        concurrent = barrierPool(pool, lockedItem); service = createClaimService(createClaimRepository(concurrent));
        const [approval, creation] = await Promise.allSettled([service.approve(owner, winner.id), service.create(other, raceItem.id, { proofDescription: 'late contender' })]);
        assert.equal(concurrent.arrivals, 2); assert.equal(approval.status, 'fulfilled');
        if (creation.status === 'rejected') assert.equal(creation.reason.status, 409);
        const [states] = await query(pool, 'SELECT claim_id,status FROM claims WHERE item_id=?', [raceItem.id]);
        assert.equal(states.filter((r) => r.status === 'APPROVED').length, 1); assert.ok(states.every((r) => ['APPROVED', 'REJECTED'].includes(r.status)));
        assert.equal((await items.get(raceItem.id)).status, 'CLAIMED');
        for (const row of states) assert.equal((await eventRows(`CLAIM_${row.status}:${row.claim_id}`)).length, 1);

        concurrent = barrierPool(pool, (sql) => sql.startsWith('INSERT INTO categories'));
        const lookup = createAdminService(createAdminRepository(concurrent), items);
        const duplicates = await Promise.allSettled([lookup.createLookup(admin, 'categories', { name: `race-${round}` }), lookup.createLookup(admin, 'categories', { name: `race-${round}` })]);
        assert.equal(concurrent.arrivals, 2); assert.equal(duplicates.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(duplicates.find((r) => r.status === 'rejected').reason.status, 409);

        // Hold emission at its SQL boundary, run read-all, then publish: the late event remains unread.
        const arrived = deferred(), publish = deferred();
        const gated = createNotificationService(createNotificationRepository(pool, async (sql, values) => {
          if (sql.startsWith('INSERT INTO notifications')) { arrived.resolve(); await publish.promise; }
          return query(pool, sql, values);
        }));
        const pending = gated.emit('NEW_MATCH', `late-${round}`, [other.id]);
        await arrived.promise;
        try { await notifications.markAll(other); } finally { publish.resolve(); }
        await pending;
        assert.equal((await eventRows(`NEW_MATCH:late-${round}`))[0].is_read, 0);
        const markReady = deferred(), read = deferred();
        const gatedRead = createNotificationService(createNotificationRepository(pool, async (sql, values) => {
          if (sql.startsWith('UPDATE notifications')) { markReady.resolve(); await read.promise; }
          return query(pool, sql, values);
        }));
        const mark = gatedRead.markAll(other); await markReady.promise;
        try { await notifications.emit('NEW_MATCH', `early-${round}`, [other.id]); } finally { read.resolve(); }
        await mark;
        assert.equal((await eventRows(`NEW_MATCH:early-${round}`))[0].is_read, 1);
        const event = (await eventRows(`NEW_MATCH:early-${round}`))[0];
        await Promise.all([notifications.markRead(other, event.notification_id), notifications.emit('NEW_MATCH', `early-${round}`, [other.id])]);
        assert.deepEqual(await eventRows(`NEW_MATCH:early-${round}`), [event]);
        assert.equal((await notifications.unread(other)).unreadCount, 0);
      });
    }

    await t.test('final Claim/Item/Notification/Audit invariants and sensitive-data negative control', async () => {
      const [rows] = await query(pool, `SELECT i.item_id,i.status,SUM(c.status='PENDING') AS pending,SUM(c.status='APPROVED') AS approved,SUM(c.status='COMPLETED') AS completed
        FROM items i LEFT JOIN claims c ON c.item_id=i.item_id GROUP BY i.item_id,i.status`);
      for (const row of rows) {
        const pending = Number(row.pending), approved = Number(row.approved), completed = Number(row.completed);
        assert.ok(approved + completed <= 1);
        if (row.status === 'CLAIM_PENDING') { assert.ok(pending > 0); assert.equal(approved + completed, 0); }
        if (row.status === 'CLAIMED') { assert.equal(approved, 1); assert.equal(pending + completed, 0); }
        if (row.status === 'RETURNED') { assert.equal(completed, 1); assert.equal(pending + approved, 0); }
      }
      const [logs] = await query(pool, 'SELECT details FROM activity_logs');
      assert.ok(!JSON.stringify(logs).includes('phase7-secret-proof'));
      assert.throws(() => assertNoPrivateData(assert, { nested: { proofDescription: 'leaked' } }), /Private field/);
      const [duplicates] = await query(pool, 'SELECT user_id,event_key FROM notifications WHERE event_key IS NOT NULL GROUP BY user_id,event_key HAVING COUNT(*)>1'); assert.deepEqual(duplicates, []);
    });
  } finally {
    if (http) await http.close(); if (pool) await pool.end();
    try { if (created) { assertOwnedDatabase(name, name); await connection.query(`DROP DATABASE ${quote(name)}`); } }
    finally { await connection.end(); }
  }
});
