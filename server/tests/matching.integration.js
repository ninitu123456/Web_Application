import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { quote } from '../../database/schema.js';
import { createDbPool, query } from '../config/db.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { createItemService } from '../services/item.service.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { calculateMatchScore } from '../utils/match-score.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
test('Matching integration: real HTTP/JWT, MySQL consistency, concurrency and failures', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Use test:integration:isolated');
  const base = configFromEnv(), adminConnection = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let created = false, pool, http;
  try {
    const [[instance]] = await adminConnection.query('SELECT @@datadir AS directory, @@port AS port');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR));
    assert.equal(Number(instance.port), base.port);
    await adminConnection.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await adminConnection.query(`USE ${quote(name)}`);
    await migrate(adminConnection, name);
    const password = randomBytes(18).toString('hex');
    await seed(adminConnection, name, { USER: { email: 'user@matching.test', password }, ADMIN: { email: 'admin@matching.test', password } });
    pool = createDbPool({ ...base, database: name });
    const users = createUserRepository(pool);
    const auth = createAuthService(users, createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
    const service = createItemService(createItemRepository(pool));
    const matching = createMatchingService(createMatchingRepository(pool));
    http = await serveApp(createApp({ healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users), itemService: service, matchingService: matching, logger: () => {} }));
    const userLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'user@matching.test', password } });
    const adminLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'admin@matching.test', password } });
    assert.equal(userLogin.status, 200); assert.equal(adminLogin.status, 200);
    const token = userLogin.json.data.token, adminToken = adminLogin.json.data.token;
    const identity = { id: String(userLogin.json.data.user.id), role: 'USER' };
    const admin = { id: String(adminLogin.json.data.user.id), role: 'ADMIN' };
    const [[category]] = await query(pool, 'SELECT category_id AS id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id AS id FROM locations ORDER BY location_id LIMIT 1');
    const input = { title: 'tai nghe', description: 'màu trắng', type: 'LOST', categoryId: Number(category.id), locationId: Number(location.id), eventDate: '2026-01-01', color: null };
    const make = (overrides = {}, currentService = service) => currentService.create(identity, { ...input, ...overrides });
    const pair = async (lost, found) => (await query(pool, 'SELECT * FROM matches WHERE lost_item_id=? AND found_item_id=?', [lost.id, found.id]))[0];
    const get = (id, jwt = token) => request(http, `/api/items/${id}/matches`, { token: jwt });
    function wrappedPool(hook, commitHook, rollbackHook) {
      return { async getConnection() {
        const real = await pool.getConnection();
        return new Proxy(real, { get(target, key) {
          if (key === 'commit' && commitHook) return () => commitHook(target);
          if (key === 'rollback' && rollbackHook) return () => rollbackHook(target);
          if (key === 'query') return async (statement, values) => { await hook(typeof statement === 'string' ? statement : statement.sql, values); return target.query(statement, values); };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
    }
    const wrapService = (hook, commitHook, rollbackHook) => createItemService(createItemRepository(wrappedPool(hook, commitHook, rollbackHook)));
    const lockName = `findit:match:${createHash('sha256').update(name).digest('hex').slice(0, 48)}`;
    const assertUnlocked = async () => { const [[row]] = await query(pool, 'SELECT IS_USED_LOCK(?) AS owner', [lockName]); assert.equal(row.owner, null); };
    let lost, found;

    await t.test('HTTP create LOST then FOUND saves exact score, explanation and inverse IDs', async () => {
      for (const type of ['LOST', 'FOUND']) {
        const response = await request(http, '/api/items', { method: 'POST', token, body: { ...input, type } });
        assert.equal(response.status, 201);
        if (type === 'LOST') lost = response.json.data; else found = response.json.data;
      }
      const rows = await pair(lost, found); assert.equal(rows.length, 1); assert.equal(Number(rows[0].match_score), 100); assert.equal(rows[0].status, 'POTENTIAL');
      const response = await get(lost.id), reverse = await get(found.id);
      assert.equal(response.status, 200);
      const result = response.json.data.find((m) => m.itemId === found.id);
      assert.deepEqual(Object.keys(result).sort(), ['itemId', 'matchId', 'reasons', 'score']);
      assert.equal(result.score, 100); assert.equal(result.reasons.length, 4);
      assert.ok(reverse.json.data.some((m) => m.itemId === lost.id));
      await assertUnlocked();
    });
    await t.test('FOUND then LOST and cross-category candidates are supported', async () => {
      const f = await make({ type: 'FOUND' });
      const [[otherCategory]] = await query(pool, 'SELECT category_id AS id FROM categories WHERE category_id <> ? LIMIT 1', [input.categoryId]);
      const l = await make({ categoryId: Number(otherCategory.id) });
      assert.equal(Number((await pair(l, f))[0].match_score), 70);
      const [[invalid]] = await query(pool, "SELECT COUNT(*) AS total FROM matches m JOIN items l ON l.item_id=m.lost_item_id JOIN items f ON f.item_id=m.found_item_id WHERE l.type <> 'LOST' OR f.type <> 'FOUND' OR l.item_id=f.item_id");
      assert.equal(Number(invalid.total), 0);
    });
    await t.test('JWT, ID validation, non-owner USER and ADMIN, missing resource, read-only and privacy', async () => {
      assert.equal((await get(lost.id, null)).status, 401);
      assert.equal((await get(lost.id, 'invalid')).status, 401);
      assert.equal((await get('bad')).status, 400);
      assert.equal((await get('9007199254740991')).status, 404);
      assert.equal((await get(lost.id, adminToken)).status, 200);
      const other = await request(http, '/api/auth/register', { method: 'POST', body: { fullName: 'Other User', email: 'other@matching.test', password } }); assert.equal(other.status, 201);
      const login = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'other@matching.test', password } });
      const before = await pair(lost, found);
      await query(pool, 'UPDATE items SET private_identifiers=? WHERE item_id=?', ['private-serial', lost.id]);
      const response = await get(lost.id, login.json.data.token); assert.equal(response.status, 200);
      assert.ok(!JSON.stringify(response.json).includes('private-serial'));
      assert.deepEqual(await pair(lost, found), before);
      await query(pool, "UPDATE users SET account_status='SUSPENDED' WHERE email='other@matching.test'");
      assert.equal((await get(lost.id, login.json.data.token)).status, 403);
      await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE email='other@matching.test'");
      const empty = await make({ title: 'unrelated', description: 'object', categoryId: input.categoryId, eventDate: '2020-01-01' });
      // Same category+location yields exactly 50 even without date/text; use a distinct location.
      const [[loc]] = await query(pool, 'SELECT location_id AS id FROM locations WHERE location_id <> ? LIMIT 1', [input.locationId]);
      await service.update(identity, empty.id, { locationId: Number(loc.id) });
      assert.deepEqual((await get(empty.id)).json.data, []);
    });
    await t.test('recompute preserves ID, created_at and terminal Match status; below-threshold rows survive but disappear', async () => {
      const original = (await pair(lost, found))[0];
      for (const status of ['CONFIRMED', 'REJECTED']) {
        await query(pool, 'UPDATE matches SET status=? WHERE match_id=?', [status, original.match_id]);
        await service.update(identity, lost.id, { description: 'màu đen' });
        let rows = await pair(lost, found); assert.equal(rows.length, 1); assert.equal(rows[0].status, status); assert.equal(rows[0].match_id, original.match_id); assert.equal(rows[0].created_at.getTime(), original.created_at.getTime()); assert.equal(Number(rows[0].match_score), 88);
        assert.ok((await get(lost.id)).json.data.some((m) => m.itemId === found.id));
        const [[loc]] = await query(pool, 'SELECT location_id AS id FROM locations WHERE location_id <> ? LIMIT 1', [input.locationId]);
        await service.update(identity, lost.id, { locationId: Number(loc.id), title: 'ví', description: 'đen', eventDate: '2020-01-01' });
        rows = await pair(lost, found); assert.equal(rows[0].status, status); assert.equal(Number(rows[0].match_score), 30);
        assert.ok(!(await get(lost.id)).json.data.some((m) => m.itemId === found.id));
        const { type, ...restore } = input;
        await service.update(identity, lost.id, restore);
      }
    });
    await t.test('color-only update and image row transactions do not recompute Matching', async () => {
      const unchanged = await pair(lost, found);
      const guarded = wrapService(async (sql) => { if (sql.includes('GET_LOCK') || sql.includes('AS categoryId')) throw new Error('must not match'); });
      await guarded.update(identity, lost.id, { color: 'Black' });
      await createItemRepository(pool).withLockedItem(lost.id, async () => {});
      assert.deepEqual(await pair(lost, found), unchanged);
    });
    await t.test('CLOSED/RETURNED exclusion on either side, historical records survive and invalid candidates are skipped', async () => {
      for (const status of ['CLOSED', 'RETURNED']) for (const side of ['LOST', 'FOUND']) {
        const l = await make(), f = await make({ type: 'FOUND' });
        const target = side === 'LOST' ? l : f;
        if (status === 'CLOSED') await service.close(identity, target.id);
        else await query(pool, 'UPDATE items SET status=? WHERE item_id=?', [status, target.id]);
        assert.deepEqual((await get(target.id)).json.data, []);
        const opposite = side === 'LOST' ? f : l;
        assert.ok(!(await get(opposite.id)).json.data.some((m) => m.itemId === target.id));
        assert.equal((await pair(l, f)).length, 1);
        const added = await make({ type: side === 'LOST' ? 'FOUND' : 'LOST' });
        assert.equal((await pair(side === 'LOST' ? target : added, side === 'FOUND' ? target : added)).length, 0);
      }
    });
    await t.test('candidate pagination covers more than 100 candidates without truncation', async () => {
      const ids = [];
      for (let i = 0; i < 105; i++) {
        const [result] = await query(pool, "INSERT INTO items (user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at) VALUES (?,?,?,'tai nghe','màu trắng','FOUND','2026-01-01','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())", [identity.id, input.categoryId, input.locationId]);
        ids.push(Number(result.insertId));
      }
      const l = await make();
      const results = (await get(l.id)).json.data;
      assert.equal(results.filter((m) => ids.includes(m.itemId)).length, 105);
      const ordered = [...results].sort((a,b) => b.score-a.score || a.matchId-b.matchId); assert.deepEqual(results, ordered);
    });
    await t.test('matching failure rolls back new Item and update, and releases advisory lock', async () => {
      const faulty = wrapService(async (sql) => { if (sql.startsWith('INSERT INTO matches')) throw new Error('injected matching failure'); });
      const [[before]] = await query(pool, 'SELECT COUNT(*) AS total FROM items');
      await assert.rejects(() => make({}, faulty), /injected matching failure/);
      const [[after]] = await query(pool, 'SELECT COUNT(*) AS total FROM items'); assert.equal(after.total, before.total);
      const previous = await service.get(lost.id), previousMatch = await pair(lost, found);
      await assert.rejects(() => faulty.update(identity, lost.id, { title: 'changed' }), /injected matching failure/);
      assert.deepEqual(await service.get(lost.id), previous); assert.deepEqual(await pair(lost, found), previousMatch);
      await assertUnlocked();
    });
    await t.test('late Matching failure rolls back already-saved matches and the Item', async () => {
      let saves = 0;
      const faulty = wrapService(async (sql) => { if (sql.startsWith('INSERT INTO matches') && ++saves === 2) throw new Error('late match failure'); });
      const [[before]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM matches) AS matches');
      await assert.rejects(() => make({}, faulty), /late match failure/); assert.equal(saves, 2);
      const [[after]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM items) AS items, (SELECT COUNT(*) FROM matches) AS matches');
      assert.deepEqual(after, before); await assertUnlocked();
    });
    await t.test('close failure rolls back status and admin audit atomically', async () => {
      const l = await make();
      const [[before]] = await query(pool, "SELECT COUNT(*) AS total FROM activity_logs WHERE action='ITEM_MODERATED_CLOSED'");
      const faulty = wrapService(async (sql) => { if (sql.startsWith('SELECT item_id AS id') && sql.includes('WHERE item_id = ? FOR UPDATE')) throw new Error('close sync failure'); });
      await assert.rejects(() => faulty.close(admin, l.id), /close sync failure/);
      assert.equal((await service.get(l.id)).status, 'OPEN');
      const [[after]] = await query(pool, "SELECT COUNT(*) AS total FROM activity_logs WHERE action='ITEM_MODERATED_CLOSED'"); assert.equal(after.total, before.total);
      await assertUnlocked();
    });
    await t.test('bounded lock wait returns failure without partial writes', async () => {
      const connection = await pool.getConnection();
      try {
        await connection.query('SELECT GET_LOCK(?, 0)', [lockName]);
        await assert.rejects(() => make(), (error) => error.status === 503);
      } finally { await connection.query('SELECT RELEASE_LOCK(?)', [lockName]); connection.release(); }
      await assertUnlocked();
    });
    await t.test('rolled-back deadlock retries on real MySQL transaction; exhausted retries leave no Item', async () => {
      let attempts = 0;
      const retry = wrapService(async (sql) => { if (sql.startsWith('INSERT INTO matches') && attempts++ < 2) throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' }); });
      const l = await make({}, retry); assert.ok((await pair(l, found)).length); await assertUnlocked();
      let starts = 0;
      const faulty = wrapService(async (sql) => { if (sql.startsWith('INSERT INTO items')) starts++; if (sql.startsWith('INSERT INTO matches')) throw Object.assign(new Error('retry exhausted'), { code: 'ER_LOCK_WAIT_TIMEOUT' }); });
      const [[before]] = await query(pool, 'SELECT COUNT(*) AS total FROM items');
      await assert.rejects(() => make({}, faulty), /retry exhausted/); assert.equal(starts, 3);
      const [[after]] = await query(pool, 'SELECT COUNT(*) AS total FROM items'); assert.equal(after.total, before.total); await assertUnlocked();
    });
    await t.test('lost COMMIT response commits consistently and never replays create', async () => {
      let commits = 0;
      const faulty = wrapService(async () => {}, async (connection) => { commits++; await connection.commit(); throw new Error('COMMIT response lost'); });
      const [[before]] = await query(pool, 'SELECT COUNT(*) AS total FROM items');
      await assert.rejects(() => make({ title: 'commit marker' }, faulty), /COMMIT response lost/);
      assert.equal(commits, 1);
      const [[after]] = await query(pool, 'SELECT COUNT(*) AS total FROM items'); assert.equal(Number(after.total), Number(before.total) + 1);
      const [[item]] = await query(pool, "SELECT item_id AS id FROM items WHERE title='commit marker'"); assert.equal((await pair(item, found)).length, 1);
      await assertUnlocked();
    });
    async function concurrent(firstOperation, secondOperation) {
      const held = deferred(), release = deferred(), waiting = deferred(); let paused = false;
      const firstService = wrapService(async (sql) => {
        if (!paused && sql.startsWith('SELECT item_id AS id') && sql.includes('WHERE item_id = ? FOR UPDATE')) { paused = true; held.resolve(); await release.promise; }
      });
      const secondService = wrapService(async (sql) => { if (sql.includes('GET_LOCK')) waiting.resolve(); });
      const first = firstOperation(firstService);
      // Observe failures immediately while the test awaits the explicit barriers.
      first.catch(() => {});
      await held.promise;
      const second = secondOperation(secondService); second.catch(() => {});
      try { await waiting.promise; } finally { release.resolve(); }
      return Promise.all([first, second]);
    }
    await t.test('concurrent create sees preceding commit and saves a unique pair', async () => {
      const [l, f] = await concurrent((s) => make({}, s), (s) => make({ type: 'FOUND' }, s));
      assert.equal((await pair(l, f)).length, 1); await assertUnlocked();
    });
    await t.test('concurrent updates use latest values from both sides, never stale scores', async () => {
      const l = await make(), f = await make({ type: 'FOUND' });
      const [latestLost, latestFound] = await concurrent((s) => s.update(identity, l.id, { title: 'ví', description: 'đen' }), (s) => s.update(identity, f.id, { title: 'ví', description: 'đen', eventDate: '2026-01-16' }));
      const expected = calculateMatchScore(latestLost, latestFound);
      assert.equal(Number((await pair(l, f))[0].match_score), expected.score); assert.equal(expected.score, 90);
      await assertUnlocked();
    });
    await t.test('update-close concurrency excludes pair and preserves historical Match', async () => {
      const l = await make(), f = await make({ type: 'FOUND' });
      await concurrent((s) => s.update(identity, l.id, { description: 'new description' }), (s) => s.close(identity, f.id));
      assert.ok(!(await get(l.id)).json.data.some((m) => m.itemId === f.id)); assert.equal((await pair(l, f)).length, 1); await assertUnlocked();
    });
    await t.test('close wins against a waiting update on the same Item', async () => {
      const l = await make();
      await assert.rejects(() => concurrent((s) => s.close(identity, l.id), (s) => s.update(identity, l.id, { title: 'must reject' })), (error) => error.status === 400);
      assert.equal((await service.get(l.id)).status, 'CLOSED'); assert.deepEqual((await get(l.id)).json.data, []); await assertUnlocked();
    });
  } finally {
    if (http) await http.close();
    if (pool) await pool.end();
    try {
      if (created) { assert.match(name, /^findit_test_[a-f0-9]{24}$/); await adminConnection.query(`DROP DATABASE ${quote(name)}`); }
    } finally { await adminConnection.end(); }
  }
});
