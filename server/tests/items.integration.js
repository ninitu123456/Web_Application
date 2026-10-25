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
import { createItemRepository } from '../repositories/item.repository.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createItemService } from '../services/item.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { createAuthService } from '../services/auth.service.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const file = () => ({ mimetype: 'image/png', buffer: png });
const input = { title: 'Regression AirPods', type: 'LOST', categoryId: 1, locationId: 1, eventDate: '2026-10-15', description: 'Regression library', color: 'White' };

test('Item integration: HTTP/JWT, transactions, concurrent uploads and durable cleanup on isolated MySQL', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Use npm run test:integration:isolated; this suite refuses the installed database');
  const base = configFromEnv();
  assert.equal(base.host, '127.0.0.1');
  const connection = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let created = false, pool, http;
  try {
    const [[instance]] = await connection.query('SELECT @@datadir AS directory, @@port AS port');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR));
    assert.equal(Number(instance.port), base.port);
    await connection.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await connection.query(`USE ${quote(name)}`);
    await migrate(connection, name);
    const password = randomBytes(18).toString('hex');
    await seed(connection, name, { USER: { email: 'user@items.example.test', password }, ADMIN: { email: 'admin@items.example.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [identities] = await query(pool, 'SELECT u.user_id AS id, r.name AS role FROM users u JOIN roles r ON r.role_id=u.role_id');
    const owner = identities.find((entry) => entry.role === 'USER');
    const admin = identities.find((entry) => entry.role === 'ADMIN');
    const [[category]] = await query(pool, 'SELECT category_id AS id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id AS id FROM locations ORDER BY location_id LIMIT 1');
    input.categoryId = Number(category.id); input.locationId = Number(location.id);
    const assets = new Map();
    let uploadHook, destroyFails = false, uploadCount = 0, failUploadAt = Infinity;
    const storage = {
      async upload(buffer, mimetype, publicId) {
        uploadCount++;
        // Model an accepted upload whose response is lost as well as normal success.
        assets.set(publicId, buffer);
        if (uploadCount === failUploadAt) throw new Error('Injected upload failure');
        if (uploadHook) await uploadHook();
        return { url: `https://mock.invalid/${publicId}`, publicId };
      },
      async destroy(publicId) {
        if (destroyFails) throw new Error('Injected cloud deletion failure');
        assets.delete(publicId);
      }
    };
    const repository = createItemRepository(pool);
    const operations = createImageOperations(pool, storage, () => {});
    const service = createItemService(repository, storage, operations);
    const users = createUserRepository(pool);
    const tokens = createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 });
    const auth = createAuthService(users, tokens);
    http = await serveApp(createApp({ healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users), itemService: service, logger: () => {} }));
    let token, adminToken, itemId;
    const create = async (overrides = {}) => service.create(owner, { ...input, ...overrides });
    const images = async (id) => (await query(pool, 'SELECT image_id, cloudinary_public_id FROM item_images WHERE item_id=? ORDER BY image_id', [id]))[0];
    function faultPool(inject, commitHook) {
      return { async getConnection() {
        const real = await pool.getConnection();
        return new Proxy(real, { get(target, key) {
          if (key === 'commit' && commitHook) return () => commitHook(target);
          if (key === 'query') return async (statement, values) => {
            const sql = typeof statement === 'string' ? statement : statement.sql;
            await inject(sql);
            return target.query(statement, values);
          };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
    }

    await t.test('real login JWT, profile and public reads work with Item routes mounted', async () => {
      const login = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'user@items.example.test', password } });
      assert.equal(login.status, 200); token = login.json.data.token;
      const adminLogin = await request(http, '/api/auth/login', { method: 'POST', body: { email: 'admin@items.example.test', password } });
      assert.equal(adminLogin.status, 200); adminToken = adminLogin.json.data.token;
      assert.equal((await request(http, '/api/users/me', { token })).status, 200);
      assert.equal((await request(http, '/api/items')).status, 200);
    });
    await t.test('LOST/FOUND creation, forged fields, auth and missing Item follow the contract', async () => {
      for (const type of ['LOST', 'FOUND']) {
        const response = await request(http, '/api/items', { method: 'POST', token, body: { ...input, type } });
        assert.equal(response.status, 201); assert.equal(response.json.data.type, type);
        assert.equal(response.json.data.status, 'OPEN'); assert.deepEqual(response.json.data.images, []);
        itemId = response.json.data.id;
      }
      assert.equal((await request(http, '/api/items', { method: 'POST', body: input })).status, 401);
      for (const body of [{ ...input, type: 'BAD' }, { ...input, status: 'CLOSED' }, { ...input, userId: admin.id }, { ...input, eventDate: '2026-02-30' }, { title: 'missing' }]) {
        assert.equal((await request(http, '/api/items', { method: 'POST', token, body })).status, 400);
      }
      assert.equal((await request(http, '/api/items/999999999')).status, 404);
      assert.equal((await request(http, '/api/items/bad')).status, 400);
    });
    await t.test('nonowner ADMIN cannot edit/upload/delete; public DTO hides private data', async () => {
      assert.equal((await request(http, `/api/items/${itemId}`, { method: 'PATCH', token: adminToken, body: { title: 'Forbidden' } })).status, 403);
      const form = new FormData(); form.append('images', new Blob([png], { type: 'image/png' }), 'image.png');
      assert.equal((await fetch(`${http.url}/api/items/${itemId}/images`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form })).status, 403);
      assert.equal((await request(http, `/api/items/${itemId}/images/999`, { method: 'DELETE', token: adminToken })).status, 403);
      const response = await request(http, `/api/items/${itemId}`);
      assert.equal(response.status, 200);
      for (const key of ['private_identifiers', 'privateIdentifiers', 'proofDescription', 'password_hash']) assert.equal(key in response.json.data, false);
    });
    await t.test('Create -> multipart upload -> search/detail images -> update -> owner close', async () => {
      const form = new FormData(); form.append('images', new Blob([png], { type: 'image/png' }), 'one.png'); form.append('images', new Blob([png], { type: 'image/png' }), 'two.png');
      const upload = await fetch(`${http.url}/api/items/${itemId}/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      assert.equal(upload.status, 201); assert.equal((await upload.json()).data.length, 2);
      const listed = await request(http, '/api/items?keyword=Regression&limit=100');
      assert.equal(listed.json.data.find((entry) => entry.id === itemId).images.length, 2);
      assert.equal((await request(http, `/api/items/${itemId}`)).json.data.images.length, 2);
      assert.equal((await request(http, `/api/items/${itemId}`, { method: 'PATCH', token, body: { title: 'Updated' } })).status, 200);
      assert.equal((await request(http, `/api/items/${itemId}/close`, { method: 'PATCH', token })).status, 200);
      assert.equal((await request(http, `/api/items/${itemId}`, { method: 'PATCH', token, body: { title: 'Invalid' } })).status, 400);
      assert.equal((await request(http, `/api/items/${itemId}/close`, { method: 'PATCH', token })).status, 400);
    });
    await t.test('each filter and combined filters execute against MySQL; empty/invalid search', async () => {
      const item = await create({ title: 'SearchUniqueFixture', type: 'LOST' });
      const filters = { keyword: 'SearchUniqueFixture', type: 'LOST', category: String(input.categoryId), location: String(input.locationId), status: 'OPEN', dateFrom: input.eventDate, dateTo: input.eventDate };
      for (const [key, value] of Object.entries(filters)) {
        const response = await request(http, `/api/items?${new URLSearchParams({ [key]: value, limit: '100' })}`);
        assert.equal(response.status, 200); assert.ok(response.json.data.some((entry) => entry.id === item.id));
      }
      for (const sort of ['newest', 'oldest', 'eventDateAsc', 'eventDateDesc']) {
        const response = await request(http, `/api/items?${new URLSearchParams({ ...filters, sort, page: '1', limit: '1' })}`);
        assert.equal(response.status, 200); assert.equal(response.json.data[0].id, item.id);
        assert.deepEqual(response.json.pagination, { page: 1, limit: 1, total: 1, totalPages: 1 });
      }
      assert.deepEqual((await request(http, '/api/items?keyword=NoSuchFixture')).json.data, []);
      for (const query of ['page=0', 'limit=101', 'sort=bad', 'dateFrom=2026-12-31&dateTo=2026-01-01']) assert.equal((await request(http, `/api/items?${query}`)).status, 400);
    });
    await t.test('ADMIN close has an atomic audit log; audit failure rolls back the close', async () => {
      const item = await create();
      assert.equal((await request(http, `/api/items/${item.id}/close`, { method: 'PATCH', token: adminToken })).status, 200);
      const [[audit]] = await query(pool, "SELECT user_id, details FROM activity_logs WHERE action='ITEM_MODERATED_CLOSED' AND entity_id=?", [item.id]);
      assert.equal(String(audit.user_id), String(admin.id));
      const details = typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details;
      assert.equal(details.previousStatus, 'OPEN'); assert.equal(details.status, 'CLOSED');
      const another = await create();
      const faulty = createItemService(createItemRepository(faultPool(async (sql) => { if (sql.includes('ITEM_MODERATED_CLOSED')) throw new Error('Audit unavailable'); })), storage, operations);
      await assert.rejects(() => faulty.close(admin, another.id), /Audit unavailable/);
      assert.equal((await repository.findById(another.id)).status, 'OPEN');
    });
    await t.test('two simultaneous uploads at count four cannot exceed five', async () => {
      const item = await create();
      await service.uploadImages(owner, item.id, [file(), file(), file(), file()]);
      let arrivals = 0, release;
      const gate = new Promise((resolve) => { release = resolve; });
      uploadHook = async () => { if (++arrivals === 2) release(); await gate; };
      let results;
      try { results = await Promise.allSettled([service.uploadImages(owner, item.id, [file()]), service.uploadImages(owner, item.id, [file()])]); }
      finally { uploadHook = undefined; }
      assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
      assert.equal(results.find((entry) => entry.status === 'rejected').reason.status, 400);
      assert.equal((await images(item.id)).length, 5);
    });
    await t.test('close during cloud upload prevents all image inserts and cleans the upload', async () => {
      const item = await create(); const before = assets.size;
      uploadHook = () => service.close(owner, item.id);
      try { await assert.rejects(() => service.uploadImages(owner, item.id, [file()]), (error) => error.status === 400); }
      finally { uploadHook = undefined; }
      assert.equal((await images(item.id)).length, 0); assert.equal(assets.size, before);
    });
    await t.test('late image DB failure rolls back the whole batch, with no SELECT-after-INSERT', async () => {
      const item = await create(); const before = assets.size; let inserts = 0;
      const faulty = createItemService(createItemRepository(faultPool(async (sql) => {
        if (sql.startsWith('INSERT INTO item_images') && ++inserts === 2) throw new Error('Second insert failed');
      })), storage, operations);
      await assert.rejects(() => faulty.uploadImages(owner, item.id, [file(), file()]), /Second insert failed/);
      assert.equal((await images(item.id)).length, 0); assert.equal(assets.size, before);
    });
    await t.test('lost upload response and failed cleanup survive a new cleanup worker', async () => {
      const item = await create(); const before = assets.size;
      failUploadAt = uploadCount + 2; destroyFails = true;
      try { await assert.rejects(() => service.uploadImages(owner, item.id, [file(), file()]), /Injected upload failure/); }
      finally { failUploadAt = Infinity; destroyFails = false; }
      assert.equal((await images(item.id)).length, 0); assert.equal(assets.size, before + 2);
      const result = await createImageOperations(pool, storage, () => {}).recoverPending();
      assert.equal(result.failed, 0); assert.ok(result.completed >= 1); assert.equal(assets.size, before);
      assert.deepEqual(await operations.recoverPending(), { completed: 0, busy: 0, failed: 0 });
    });
    await t.test('failed cloud delete returns 503 and retains a durable retry instead of silent success', async () => {
      const item = await create(); await service.uploadImages(owner, item.id, [file()]);
      const [image] = await images(item.id); const before = assets.size;
      destroyFails = true;
      try { await assert.rejects(() => service.deleteImage(owner, item.id, image.image_id), (error) => error.status === 503); }
      finally { destroyFails = false; }
      assert.equal((await images(item.id)).length, 0); assert.equal(assets.size, before);
      assert.equal((await createImageOperations(pool, storage, () => {}).recoverPending()).failed, 0);
      assert.equal(assets.size, before - 1);
    });
    await t.test('failed DB delete preserves both image reference and cloud asset', async () => {
      const item = await create(); await service.uploadImages(owner, item.id, [file()]); const [image] = await images(item.id); const before = assets.size;
      const faulty = createItemService(createItemRepository(faultPool(async (sql) => { if (sql.startsWith('DELETE FROM item_images')) throw new Error('Delete unavailable'); })), storage, operations);
      await assert.rejects(() => faulty.deleteImage(owner, item.id, image.image_id), /Delete unavailable/);
      assert.equal((await images(item.id)).length, 1); assert.equal(assets.size, before);
    });
    await t.test('missing storage refuses delete without losing the public ID', async () => {
      const item = await create(); await service.uploadImages(owner, item.id, [file()]); const [image] = await images(item.id);
      await assert.rejects(() => createItemService(repository, undefined, operations).deleteImage(owner, item.id, image.image_id), (error) => error.status === 503);
      assert.equal((await images(item.id)).length, 1);
    });
    await t.test('lost COMMIT response never triggers deletion of committed images', async () => {
      const item = await create(); const before = assets.size;
      const faulty = createItemService(createItemRepository(faultPool(async () => {}, async (real) => {
        await real.commit(); throw new Error('Lost COMMIT response');
      })), storage, operations);
      await assert.rejects(() => faulty.uploadImages(owner, item.id, [file()]), /Lost COMMIT response/);
      assert.equal((await images(item.id)).length, 1); assert.equal(assets.size, before + 1);
      assert.deepEqual(await operations.recoverPending(), { completed: 0, busy: 0, failed: 0 });
    });
    await t.test('cleanup workers skip in-flight uploads and preserve their cloud assets', async () => {
      const item = await create();
      let started, resume;
      const ready = new Promise((resolve) => { started = resolve; });
      const gate = new Promise((resolve) => { resume = resolve; });
      uploadHook = async () => { started(); await gate; };
      const uploading = service.uploadImages(owner, item.id, [file()]);
      try {
        await ready;
        const before = assets.size;
        const result = await createImageOperations(pool, storage, () => {}).recoverPending();
        assert.equal(result.busy, 1); assert.equal(result.failed, 0); assert.equal(assets.size, before);
      } finally { resume(); uploadHook = undefined; }
      assert.equal((await uploading).length, 1);
      assert.equal((await images(item.id)).length, 1);
    });
    await t.test('all Item states except OPEN reject owner update/close/upload/delete with 400', async () => {
      for (const status of ['CLAIM_PENDING', 'CLAIMED', 'RETURNED', 'CLOSED']) {
        const item = await create();
        await query(pool, 'UPDATE items SET status=? WHERE item_id=?', [status, item.id]);
        for (const operation of [
          () => service.update(owner, item.id, { title: 'Forbidden' }),
          () => service.close(owner, item.id),
          () => service.uploadImages(owner, item.id, [file()]),
          () => service.deleteImage(owner, item.id, 999)
        ]) await assert.rejects(operation, (error) => error.status === 400);
      }
    });
  } finally {
    if (http) await http.close();
    if (pool) await pool.end();
    try {
      if (created) {
        assert.match(name, /^findit_test_[a-f0-9]{24}$/);
        await connection.query(`DROP DATABASE ${quote(name)}`);
      }
    } finally { await connection.end(); }
  }
});
