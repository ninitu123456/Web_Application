import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateItem, validateUpdateItem, validateSearch } from '../validation/item.validation.js';
import { createItemService as buildItemService } from '../services/item.service.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { serve } from './helpers.js';

// Unit doubles only. Real transaction, journal and locking are exercised in
// items.integration.js against a newly created database on the isolated server.
function createItemService(repository, storage) {
  repository.withLockedItem = async (id, operation) => operation(repository);
  repository.recordClose ??= async () => {};
  repository.completeImageOperation ??= async () => {};
  return buildItemService(repository, storage, {
    async run(details, operation) {
      const result = await operation('unit-operation');
      if (details.kind === 'DELETE') for (const publicId of details.publicIds) await storage.destroy(publicId);
      return result;
    }
  });
}

const good = { title: 'Lost AirPods', type: 'LOST', categoryId: 1, locationId: 2, eventDate: '2026-10-25', description: 'Near the library', color: 'White' };
function record(overrides = {}) {
  return { item_id: '4', user_id: '10', category_id: '1', location_id: '2', title: 'AirPods', description: 'Near library', type: 'LOST', color: null, event_date: '2026-10-25', status: 'OPEN', created_at: new Date('2026-10-25T10:00:00Z'), updated_at: new Date('2026-10-25T10:00:00Z'), category_name: 'Electronics', location_name: 'Library', private_identifiers: 'serial-should-never-appear', images: [], ...overrides };
}
test('create validation accepts LOST and FOUND and rejects missing, forged, malformed, and unexpected input', () => {
  assert.equal(validateCreateItem(good).type, 'LOST');
  assert.equal(validateCreateItem({ ...good, type: 'FOUND' }).type, 'FOUND');
  for (const bad of [
    { ...good, type: 'OTHER' }, { ...good, userId: 11 }, { ...good, status: 'CLOSED' },
    { ...good, categoryId: '1 OR 1=1' }, { ...good, eventDate: '2026-02-30' },
    Object.fromEntries(Object.entries(good).filter(([key]) => key !== 'description'))
  ]) assert.throws(() => validateCreateItem(bad), (error) => error.status === 400);
});
test('update and search validations constrain fields, dates, pages, and sort values', () => {
  assert.deepEqual(validateUpdateItem({ title: 'New title' }), { title: 'New title' });
  for (const bad of [{ type: 'FOUND' }, { status: 'CLOSED' }, { userId: 5 }, {}]) assert.throws(() => validateUpdateItem(bad));
  assert.equal(validateSearch({ type: 'LOST', category: '1', location: '2', page: '2', limit: '10', dateFrom: '2026-01-01', dateTo: '2026-12-31', sort: 'oldest' }).sort, 'oldest');
  for (const query of [{ page: '0' }, { limit: '101' }, { dateFrom: '2026-02-01', dateTo: '2026-01-01' }, { sort: 'created_at desc' }, { status: 'INVALID' }]) assert.throws(() => validateSearch(query));
  assert.equal(validateSearch({ keyword: "' OR 1=1 --" }).keyword, "' OR 1=1 --");
});
test('service binds creation to authenticated owner, exposes only safe fields, and enforces ownership and transitions', async () => {
  let current = record(); const created = [];
  const repository = {
    async categoryActive(id) { return id === 1; }, async locationActive(id) { return id === 2; },
    async create(userId, data) { created.push({ userId, data }); current = record({ user_id: String(userId) }); return current; },
    async findById() { return current; }, async update(id, fields) { current = { ...current, ...fields }; return 1; },
    async close() { current = { ...current, status: 'CLOSED' }; return 1; },
    async list() { return { items: [current], total: 1 }; }
  };
  const service = createItemService(repository);
  const createdDto = await service.create({ id: '10', role: 'USER' }, validateCreateItem(good));
  assert.equal(created[0].userId, '10');
  assert.equal(createdDto.status, 'OPEN');
  assert.equal(JSON.stringify(createdDto).includes('private_identifiers'), false);
  assert.equal((await service.get(4)).category.name, 'Electronics');
  await assert.rejects(() => service.update({ id: '11', role: 'USER' }, 4, { title: 'No' }), (error) => error.status === 403);
  assert.equal((await service.update({ id: '10', role: 'USER' }, 4, { title: 'Updated' })).title, 'Updated');
  assert.equal((await service.close({ id: '10', role: 'USER' }, 4)).status, 'CLOSED');
  await assert.rejects(() => service.update({ id: '10', role: 'USER' }, 4, { title: 'No' }), (error) => error.status === 400);
});
test('reference validation rejects inactive categories and locations', async () => {
  const repo = { async categoryActive() { return false; }, async locationActive() { return true; } };
  await assert.rejects(() => createItemService(repo).create({ id: 1 }, validateCreateItem(good)), (error) => error.status === 400);
  const locationRepo = { async categoryActive() { return true; }, async locationActive() { return false; } };
  await assert.rejects(() => createItemService(locationRepo).create({ id: 1 }, validateCreateItem(good)), (error) => error.status === 400);
});
test('search returns empty results with stable pagination and image deletion checks ownership', async () => {
  let removed = false, destroyed = '';
  const repository = {
    async list() { return { items: [], total: 0 }; }, async findById() { return record(); },
    async findImage() { return { image_id: '7', item_id: '4', cloudinary_public_id: 'findit/7' }; },
    async deleteImage() { removed = true; }
  };
  const service = createItemService(repository, { async destroy(publicId) { destroyed = publicId; } });
  const page = await service.list({ page: 1, limit: 10 });
  assert.deepEqual(page, { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
  await assert.rejects(() => service.deleteImage({ id: '11', role: 'USER' }, 4, 7), (error) => error.status === 403);
  await service.deleteImage({ id: '10', role: 'USER' }, 4, 7);
  assert.equal(removed, true);
  assert.equal(destroyed, 'findit/7');
});
test('image upload succeeds with mocked storage and enforces five images per Item', async () => {
  let existing = 3, nextId = 20;
  const uploads = [], images = [];
  const repository = {
    async findById() { return record(); },
    async countImages() { return existing; },
    async addImage(itemId, url, publicId) {
      const image = { image_id: String(++nextId), item_id: String(itemId), image_url: url, cloudinary_public_id: publicId };
      images.push(image); existing++;
      return image;
    }
  };
  const storage = {
    async upload(buffer, mimetype, publicId) { uploads.push({ buffer, mimetype }); return { url: `https://image.test/${publicId}.png`, publicId }; },
    async destroy() {}
  };
  const service = createItemService(repository, storage);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await service.uploadImages({ id: '10', role: 'USER' }, 4, [0, 1].map(() => ({ mimetype: 'image/png', buffer: png })));
  assert.equal(result.length, 2);
  assert.equal(uploads.length, 2);
  assert.equal(result[0].id, 21);
  assert.match(result[0].url, /^https:\/\/image.test\/findit\/items\//);
  // Existing 3 plus 2 new images reaches the per-Item maximum exactly.
  await assert.rejects(() => service.uploadImages({ id: '10', role: 'USER' }, 4, [{ mimetype: 'image/png', buffer: png }]), (error) => error.status === 400);
  assert.equal(uploads.length, 2);
});
test('rejects existing plus new images above five before Cloudinary is called', async () => {
  let uploadCalls = 0;
  const service = createItemService({
    async findById() { return record(); }, async countImages() { return 4; }
  }, { async upload() { uploadCalls++; return { url: 'unused', publicId: 'unused' }; } });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await assert.rejects(() => service.uploadImages({ id: '10', role: 'USER' }, 4,
    [0, 1].map(() => ({ mimetype: 'image/png', buffer: png }))), (error) => error.status === 400);
  assert.equal(uploadCalls, 0);
});
test('cannot delete images from a CLOSED Item', async () => {
  const service = createItemService({
    async findById() { return record({ status: 'CLOSED' }); },
    async findImage() { assert.fail('must reject before image lookup'); }
  }, { async destroy() {} });
  await assert.rejects(() => service.deleteImage({ id: '10', role: 'USER' }, 4, 7), (error) => error.status === 400);
});
test('repository search binds every filter and uses a fixed ORDER BY with pagination', async () => {
  const statements = [];
  const connection = {
    async query(statement, values = []) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      statements.push({ sql, values });
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ total: '0' }], []];
      return [[], []];
    }, release() {}
  };
  const repository = createItemRepository({ async getConnection() { return connection; } });
  const injection = "' OR 1=1 --";
  const result = await repository.list({ keyword: injection, type: 'LOST', category: 3, location: 4, status: 'OPEN', dateFrom: '2026-01-01', dateTo: '2026-12-31', sort: 'eventDateDesc', page: 2, limit: 10 });
  assert.deepEqual(result, { items: [], total: 0 });
  const select = statements.find(({ sql }) => sql.startsWith('SELECT i.item_id'));
  assert.equal(select.values[0], `%${injection}%`);
  assert.deepEqual(select.values.slice(3), ['LOST', 3, 4, 'OPEN', '2026-01-01', '2026-12-31', 10, 10]);
  assert.match(select.sql, /ORDER BY i\.event_date DESC, i\.item_id DESC LIMIT \? OFFSET \?/);
  assert.equal(select.sql.includes(injection), false);
});
test('detail returns 404 when missing and image upload checks owner and content signature', async () => {
  const repository = { async findById() { return record(); }, async countImages() { return 0; } };
  const storage = { async upload() { throw new Error('must not upload invalid bytes'); } };
  const service = createItemService(repository, storage);
  await assert.rejects(() => createItemService({ async findById() { return undefined; } }).get(999), (error) => error.status === 404);
  await assert.rejects(() => service.uploadImages({ id: '11', role: 'USER' }, 4, [{ mimetype: 'image/png', buffer: Buffer.from('not an image') }]), (error) => error.status === 403);
  await assert.rejects(() => service.uploadImages({ id: '10', role: 'USER' }, 4, [{ mimetype: 'image/png', buffer: Buffer.from('not an image') }]), (error) => error.status === 400);
});
test('HTTP item endpoints require auth for writes and reject invalid multipart image type', async () => {
  const item = record();
  const itemService = {
    async list(filters) { return { data: [], pagination: { page: filters.page, limit: filters.limit, total: 0, totalPages: 0 } }; },
    async get() { return (await createItemService({ findById: async () => item }).get(4)); },
    async create(identity, data) { return { id: 4, userId: identity.id, ...data, status: 'OPEN' }; },
    async update(identity, id, data) { return { id, userId: identity.id, ...data, status: 'OPEN' }; },
    async close(identity, id) { return { id, userId: identity.id, status: 'CLOSED' }; },
    async uploadImages() { return []; }
  };
  const authService = { async authenticate(token) { if (token === 'valid') return { id: '10', role: 'USER' }; throw Object.assign(new Error('bad token'), { status: 401 }); } };
  const http = await serve({ healthService: { async check() { return {}; } }, authService, userService: {}, itemService });
  try {
    assert.equal((await fetch(`${http.url}/api/items`)).status, 200);
    assert.equal((await fetch(`${http.url}/api/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(good) })).status, 401);
    const headers = { Authorization: 'Bearer valid', 'Content-Type': 'application/json' };
    const created = await fetch(`${http.url}/api/items`, { method: 'POST', headers, body: JSON.stringify(good) });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.userId, '10');
    const updated = await fetch(`${http.url}/api/items/4`, { method: 'PATCH', headers, body: JSON.stringify({ title: 'Updated AirPods' }) });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).data.title, 'Updated AirPods');
    const closed = await fetch(`${http.url}/api/items/4/close`, { method: 'PATCH', headers });
    assert.equal(closed.status, 200);
    assert.equal((await closed.json()).data.status, 'CLOSED');
    assert.equal((await fetch(`${http.url}/api/items/4/images`, { method: 'POST' })).status, 401);
    const form = new FormData(); form.append('images', new Blob(['bad'], { type: 'text/plain' }), 'bad.txt');
    const response = await fetch(`${http.url}/api/items/4/images`, { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: form });
    assert.equal(response.status, 400);
    const largeForm = new FormData(); largeForm.append('images', new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    const largeResponse = await fetch(`${http.url}/api/items/4/images`, { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: largeForm });
    assert.equal(largeResponse.status, 413);
  } finally { await http.close(); }
});
