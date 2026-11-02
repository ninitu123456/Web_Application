import { assertIsolatedInstance, assertOwnedDatabase } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query, transaction, withConnection } from '../config/db.js';
import { matchingTransaction } from '../services/matching-transaction.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { serve } from './helpers.js';
import { createAdminService } from '../services/admin.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createImageOperations } from '../services/image-operations.js';

function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise, ms = 2000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Barrier timed out')), ms); })]); }
  finally { clearTimeout(timer); }
}

test('Audit fixes: real isolated MySQL regression', { timeout: 120000 }, async (t) => {
  const base = configFromEnv(), name = `findit_test_${randomBytes(12).toString('hex')}`;
  const setup = await connect(base, false);
  let created = false, pool;
  try {
    await setup.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await setup.query(`USE \`${name}\``); await migrate(setup, name);
    const password = randomBytes(24).toString('hex');
    await seed(setup, name, { USER: { email: 'user@audit.test', password }, ADMIN: { email: 'admin@audit.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [users] = await query(pool, 'SELECT u.user_id AS id,r.name AS role FROM users u JOIN roles r ON r.role_id=u.role_id');
    const owner = users.find((u) => u.role === 'USER');
    const [[category]] = await query(pool, 'SELECT category_id AS id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id AS id FROM locations LIMIT 1');
    const input = { title: 'Audit regression', description: 'Audit regression', type: 'FOUND', categoryId: Number(category.id), locationId: Number(location.id), eventDate: '2026-10-20', color: null };

    for (const mode of ['ordinary', 'matching']) for (const boundary of ['beginTransaction', 'commit', 'rollback']) await t.test(`F02: ${mode} / real ${boundary} response blackhole is bounded without replay`, async () => {
      const sockets = new Set(), committed = deferred(); let drop = false, dropped = 0, boundaries = 0, destroyed = 0, released = 0, operations = 0;
      const proxy = net.createServer((client) => {
        const upstream = net.connect(base.port, '127.0.0.1'); sockets.add(client); sockets.add(upstream);
        client.on('error', () => {}); upstream.on('error', () => {}); client.pipe(upstream);
        upstream.on('data', (chunk) => { if (drop) { dropped++; committed.resolve(); } else client.write(chunk); });
        client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
      });
      await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      const proxied = createDbPool({ ...base, database: name, port: proxy.address().port });
      const wrapper = { async getConnection() {
        const real = await proxied.getConnection();
        return new Proxy(real, { get(target, key) {
          if (key === boundary) return () => { drop = true; boundaries++; return target[boundary](); };
          if (key === 'release') return () => { released++; target.release(); };
          if (key === 'destroy') return () => { destroyed++; target.destroy(); };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      try {
        const action = `AUDIT_TX_${mode}_${boundary}`;
        const pending = (mode === 'matching' ? matchingTransaction : transaction)(wrapper, async (connection) => {
          operations++;
          await connection.query({ sql: "INSERT INTO activity_logs(action,entity_type,created_at) VALUES(?,'AUDIT',UTC_TIMESTAMP())", timeout: 500 }, [action]);
          if (boundary === 'rollback') throw new Error('force rollback');
        });
        // Production boundary is 5 seconds: do not use a mocked thrown exception.
        const rejected = assert.rejects(() => pending, (e) => e.fatal === true && (boundary !== 'commit' || e.commitOutcome === 'unknown'));
        rejected.catch(() => {});
        await bounded(committed.promise); assert.equal(dropped, 1);
        await bounded(rejected, 6500);
        assert.equal(boundaries, 1); assert.equal(destroyed, 1); assert.equal(released, 0);
        assert.equal(operations, boundary === 'beginTransaction' ? 0 : 1);
        const [[row]] = await query(pool, 'SELECT COUNT(*) AS total FROM activity_logs WHERE action=?', [action]);
        assert.equal(Number(row.total), boundary === 'commit' ? 1 : 0);
      } finally {
        for (const socket of sockets) socket.destroy();
        await proxied.end(); await new Promise((resolve) => proxy.close(resolve));
      }
    });

    await t.test('F01: image operation reuses the advisory-lock session for its short transaction', async () => {
      let acquisitions = 0, lockSession, insertSession, deleteSession, inStorageTransaction, transactionOpen = false, cleanups = 0;
      const wrapper = { async getConnection() {
        acquisitions++; const real = await pool.getConnection();
        return new Proxy(real, { get(target, key) {
          if (key === 'query') return async (statement, values) => {
            const sql = typeof statement === 'string' ? statement : statement.sql;
            if (sql.includes('GET_LOCK')) lockSession = target.threadId;
            if (sql.startsWith('INSERT INTO item_images')) insertSession = target.threadId;
            if (sql.startsWith('DELETE FROM item_images')) deleteSession = target.threadId;
            return target.query(statement, values);
          };
          if (key === 'beginTransaction') return async () => { await target.beginTransaction(); transactionOpen = true; };
          if (key === 'commit' || key === 'rollback') return async () => { await target[key](); transactionOpen = false; };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      const repository = createItemRepository(wrapper);
      const item = await createItemService(repository).create(owner, input);
      const storage = { async upload(_bytes, _type, publicId) {
        const [[row]] = await query(pool, 'SELECT COUNT(*) AS total FROM information_schema.innodb_trx WHERE trx_mysql_thread_id=?', [lockSession]);
        inStorageTransaction = Number(row.total); return { publicId, url: 'https://mock.invalid/a.png' };
      }, async destroy() { assert.equal(transactionOpen, false, 'cleanup must commit before storage IO'); cleanups++; } };
      const service = createItemService(repository, storage, createImageOperations(wrapper, storage, () => {}));
      const before = acquisitions;
      const saved = await service.uploadImages(owner, item.id, [{ buffer: Buffer.from([137,80,78,71,13,10,26,10]), mimetype: 'image/png' }]);
      assert.equal(lockSession, insertSession, 'journal lock and image write must share one session');
      assert.equal(inStorageTransaction, 0);
      assert.equal(acquisitions - before, 4, 'three preflight reads and one image-operation session');
      await service.deleteImage(owner, item.id, saved[0].id);
      assert.equal(deleteSession, lockSession); assert.equal(cleanups, 1);
    });

    await t.test('F01: ten slow uploads reserve at most four sessions and independent SQL proceeds', async () => {
      const repository = createItemRepository(pool);
      const items = [];
      for (let i = 0; i < 10; i++) items.push(await createItemService(repository).create(owner, input));
      const gate = deferred(), entered = deferred(); let active = 0, peak = 0, calls = 0;
      const storage = { async upload(_bytes, _type, publicId) {
        peak = Math.max(peak, ++active); if (++calls === 4) entered.resolve();
        await gate.promise; active--; return { publicId, url: 'https://mock.invalid/concurrent.png' };
      }, async destroy() {} };
      const service = createItemService(repository, storage, createImageOperations(pool, storage, () => {}));
      const uploads = items.map((item) => service.uploadImages(owner, item.id, [{ buffer: Buffer.from([137,80,78,71,13,10,26,10]), mimetype: 'image/png' }]));
      const all = Promise.all(uploads);
      try { await bounded(entered.promise); await bounded(query(pool, 'SELECT 1'), 1000); assert.equal(peak, 4); }
      finally { gate.resolve(); await all; }
      assert.equal(calls, 10); assert.equal(peak, 4);
    });

    await t.test('F03: 100 failing operations cannot starve operation 101 across worker restart', async () => {
      const item = await createItemService(createItemRepository(pool)).create(owner, input);
      const ids = [];
      for (let i = 0; i < 101; i++) {
        const operationId = `fair-${randomBytes(12).toString('hex')}`; ids.push(operationId);
        await query(pool, "INSERT INTO activity_logs(action,entity_type,entity_id,details,created_at) VALUES('IMAGE_OPERATION_STARTED','ITEM',?,?,UTC_TIMESTAMP())",
          [item.id, JSON.stringify({ operationId, kind: 'UPLOAD', publicIds: [i < 100 ? `fail-${operationId}` : `ok-${operationId}`] })]);
      }
      let healthy = false; const removed = [];
      const storage = { async destroy(id) { if (!healthy && id.startsWith('fail-')) throw new Error('storage failure'); removed.push(id); } };
      const first = await createImageOperations(pool, storage, () => {}).recoverPending();
      assert.equal(first.failed, 100);
      const second = await createImageOperations(pool, storage, () => {}).recoverPending();
      assert.equal(second.completed, 1); assert.ok(removed.includes(`ok-${ids[100]}`));
      healthy = true;
      const third = await createImageOperations(pool, storage, () => {}).recoverPending();
      assert.equal(third.completed, 100);
      assert.deepEqual(await createImageOperations(pool, storage, () => {}).recoverPending(), { completed: 0, busy: 0, failed: 0 });
    });

    await t.test('F03: multiple workers advance past a busy operation and retry it later', async () => {
      const item = await createItemService(createItemRepository(pool)).create(owner, input);
      const ids = [];
      for (let i = 0; i < 101; i++) {
        const operationId = `busy-${randomBytes(12).toString('hex')}`; ids.push(operationId);
        await query(pool, "INSERT INTO activity_logs(action,entity_type,entity_id,details,created_at) VALUES('IMAGE_OPERATION_STARTED','ITEM',?,?,UTC_TIMESTAMP())", [item.id, JSON.stringify({ operationId, kind: 'UPLOAD', publicIds: [operationId] })]);
      }
      const removed = new Set(), held = deferred(), resume = deferred();
      const holding = withConnection(pool, async (connection) => {
        await connection.query('SELECT GET_LOCK(?,0)', [`findit:image:${ids[0]}`]); held.resolve();
        await resume.promise; await connection.query('SELECT RELEASE_LOCK(?)', [`findit:image:${ids[0]}`]);
      });
      await bounded(held.promise);
      const storage = { async destroy(id) { removed.add(id); } };
      const workers = [createImageOperations(pool, storage, () => {}), createImageOperations(pool, storage, () => {})];
      try {
        const results = await Promise.all(workers.map((worker) => worker.recoverPending()));
        const last = await createImageOperations(pool, storage, () => {}).recoverPending();
        assert.ok(results.reduce((sum, result) => sum + result.busy, last.busy) >= 1);
        assert.ok(removed.has(ids[100])); assert.equal(removed.has(ids[0]), false); assert.equal(removed.size, 100);
      } finally { resume.resolve(); await holding; }
      await createImageOperations(pool, storage, () => {}).recoverPending();
      assert.equal(removed.size, 101);
    });

    for (let round = 0; round < 3; round++) for (const kind of ['category', 'location']) for (const mutation of ['create', 'update']) {
      const table = kind === 'category' ? 'categories' : 'locations';
      const key = `${kind}_id`, referenceId = kind === 'category' ? category.id : location.id;
      const field = `${kind}Id`;
      for (const winner of ['deactivate', 'write']) await t.test(`F06: ${mutation} / ${kind} / ${winner} wins / round ${round + 1}`, async () => {
        await query(pool, 'UPDATE categories SET is_active=TRUE');
        await query(pool, 'UPDATE locations SET is_active=TRUE');
        const ordinary = createItemService(createItemRepository(pool));
        const item = mutation === 'update' ? await ordinary.create(owner, input) : undefined;
        if (winner === 'deactivate') {
          const held = deferred(), resume = deferred();
          const deactivation = transaction(pool, async (connection) => {
            await connection.query(`UPDATE ${table} SET is_active=FALSE WHERE ${key}=?`, [referenceId]);
            held.resolve(); await resume.promise;
          });
          await bounded(held.promise);
          const writing = mutation === 'create' ? ordinary.create(owner, input) : ordinary.update(owner, item.id, { [field]: Number(referenceId) });
          const rejected = assert.rejects(() => writing, (e) => e.status === 400); rejected.catch(() => {});
          await delay(30); resume.resolve(); await deactivation; await rejected;
        } else {
          const held = deferred(), resume = deferred();
          const wrapper = { async getConnection() {
            const real = await pool.getConnection();
            return new Proxy(real, { get(target, key) {
              if (key === 'query') return async (statement, values) => {
                const sql = typeof statement === 'string' ? statement : statement.sql;
                if (sql.startsWith(mutation === 'create' ? 'INSERT INTO items ' : 'UPDATE items SET')) { held.resolve(); await resume.promise; }
                return target.query(statement, values);
              };
              const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
            } });
          } };
          const service = createItemService(createItemRepository(wrapper));
          const writing = mutation === 'create' ? service.create(owner, input) : service.update(owner, item.id, { [field]: Number(referenceId) });
          await bounded(held.promise);
          let finished = false;
          const deactivation = query(pool, `UPDATE ${table} SET is_active=FALSE WHERE ${key}=?`, [referenceId]).then(() => { finished = true; });
          try { await delay(40); assert.equal(finished, false, 'deactivation must wait for the Item transaction'); }
          finally { resume.resolve(); await writing; await deactivation; }
        }
        await query(pool, `UPDATE ${table} SET is_active=TRUE WHERE ${key}=?`, [referenceId]);
      });
    }

    const admin = users.find((u) => u.role === 'ADMIN');
    const [added] = await query(pool, "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) SELECT role_id,'Second admin','second@audit.test',password_hash,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users WHERE user_id=?", [admin.id]);
    const secondAdmin = { id: String(added.insertId), role: 'ADMIN' };
    const admins = createAdminService(createAdminRepository(pool));
    for (let round = 0; round < 5; round++) await t.test(`F07: two ADMINs suspend each other over HTTP, round ${round + 1}`, async () => {
      await query(pool, 'UPDATE users SET account_status=\'ACTIVE\'');
      const ready = deferred(); let arrivals = 0;
      const http = await serve({ healthService: { async check() { return {}; } }, userService: {}, adminService: admins, authService: { async authenticate(token) {
        const actor = token === 'first' ? admin : secondAdmin;
        if (++arrivals === 2) ready.resolve(); await ready.promise; return actor;
      } } });
      try {
        const request = (token, target) => fetch(`${http.url}/api/admin/users/${target}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUSPENDED' }) });
        const responses = await bounded(Promise.all([request('first', secondAdmin.id), request('second', admin.id)]));
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const [[count]] = await query(pool, "SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.name='ADMIN' AND u.account_status='ACTIVE'");
        assert.equal(Number(count.total), 1);
      } finally { await http.close(); }
    });
    await t.test('F07: actor suspended after authentication cannot mutate another user', async () => {
      await query(pool, "UPDATE users SET account_status='ACTIVE'");
      const authenticated = deferred(), resume = deferred();
      const http = await serve({ healthService: { async check() { return {}; } }, userService: {}, adminService: admins, authService: { async authenticate() { authenticated.resolve(); await resume.promise; return secondAdmin; } } });
      try {
        const pending = fetch(`${http.url}/api/admin/users/${owner.id}/status`, { method: 'PATCH', headers: { Authorization: 'Bearer second', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUSPENDED' }) });
        await bounded(authenticated.promise);
        await admins.setUserStatus(admin, secondAdmin.id, 'SUSPENDED'); resume.resolve();
        assert.equal((await pending).status, 403);
        const [[row]] = await query(pool, 'SELECT account_status FROM users WHERE user_id=?', [owner.id]); assert.equal(row.account_status, 'ACTIVE');
      } finally { resume.resolve(); await http.close(); }
    });
    await t.test('F07: stale actor cannot remove the final ACTIVE ADMIN; invariant returns 409', async () => {
      await query(pool, "UPDATE users SET account_status='ACTIVE'");
      await admins.setUserStatus(admin, secondAdmin.id, 'SUSPENDED');
      await assert.rejects(() => admins.setUserStatus(secondAdmin, admin.id, 'SUSPENDED'), (e) => e.status === 409);
      const [[count]] = await query(pool, "SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.name='ADMIN' AND u.account_status='ACTIVE'");
      assert.equal(Number(count.total), 1);
    });
    await t.test('F07: audit failure rolls back status; no-op emits no audit; self-suspend remains 409', async () => {
      await query(pool, "UPDATE users SET account_status='ACTIVE'");
      const [[before]] = await query(pool, "SELECT COUNT(*) AS total FROM activity_logs WHERE action='USER_STATUS_CHANGED'");
      await admins.setUserStatus(admin, owner.id, 'ACTIVE');
      await assert.rejects(() => admins.setUserStatus(admin, admin.id, 'SUSPENDED'), (e) => e.status === 409);
      await query(pool, "CREATE TRIGGER audit_status_failure BEFORE INSERT ON activity_logs FOR EACH ROW BEGIN IF NEW.action='USER_STATUS_CHANGED' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='audit failure'; END IF; END");
      try { await assert.rejects(() => admins.setUserStatus(admin, owner.id, 'SUSPENDED'), /audit failure/); }
      finally { await query(pool, 'DROP TRIGGER audit_status_failure'); }
      const [[row]] = await query(pool, 'SELECT account_status FROM users WHERE user_id=?', [owner.id]); assert.equal(row.account_status, 'ACTIVE');
      const [[after]] = await query(pool, "SELECT COUNT(*) AS total FROM activity_logs WHERE action='USER_STATUS_CHANGED'"); assert.equal(after.total, before.total);
    });
  } finally {
    if (pool) await pool.end();
    try { if (created) { assertOwnedDatabase(name, name); await setup.query(`DROP DATABASE \`${name}\``); } }
    finally { await setup.end(); }
  }
});
