import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers.js';
import { createLookupService } from '../services/lookup.service.js';
import { createItemRepository } from '../repositories/item.repository.js';

test('public lookup routes emit only id/name and reject unknown query fields', async () => {
  const lookupService = createLookupService({
    async categories() { return [{ id: '8', name: 'Sách', secret: 'not-public', is_active: true }]; },
    async locations() { return [{ id: '12', name: 'Thư viện', is_active: true }]; }
  });
  const http = await serve({ healthService: { async check() {} }, lookupService });
  try {
    for (const [path, expected] of [['categories', [{ id: 8, name: 'Sách' }]], ['locations', [{ id: 12, name: 'Thư viện' }]]]) {
      const response = await fetch(`${http.url}/api/${path}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true, data: expected });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await fetch(`${http.url}/api/${path}?isActive=false`)).status, 400);
    }
  } finally { await http.close(); }
});

test('mine route precedes :id, requires active JWT identity, rejects account selection and invalid pagination', async () => {
  const calls = [];
  const http = await serve({
    healthService: { async check() {} }, userService: {},
    authService: { async authenticate(token) { assert.equal(token, 'test'); return { id: 71, role: 'USER' }; } },
    itemService: { async list(options, owner) { calls.push({ options, owner }); return { data: [], pagination: { ...options, total: 0, totalPages: 0 } }; }, async get() { throw new Error('mine must not be parsed as id'); } }
  });
  try {
    assert.equal((await fetch(`${http.url}/api/items/mine`)).status, 401);
    const headers = { Authorization: 'Bearer test' };
    const response = await fetch(`${http.url}/api/items/mine?page=2&limit=3`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [{ options: { page: 2, limit: 3 }, owner: 71 }]);
    for (const query of ['userId=5', 'ownerId=1', 'page=0', 'limit=101', 'page=1&page=2', 'page=100002&limit=1']) assert.equal((await fetch(`${http.url}/api/items/mine?${query}`, { headers })).status, 400);
  } finally { await http.close(); }
});

test('mine repository applies owner restriction in COUNT and SELECT without trusting filters', async () => {
  const statements = [];
  const repository = createItemRepository({}, async (sql, values) => {
    statements.push({ sql, values });
    return sql.startsWith('SELECT COUNT') ? [[{ total: 0 }]] : [[]];
  });
  await repository.list({ page: 2, limit: 10, userId: 99 }, 71);
  assert.equal(statements.length, 2);
  for (const entry of statements) { assert.match(entry.sql, /WHERE i\.user_id = \?/); assert.equal(entry.values[0], 71); assert.ok(!entry.values.includes(99)); }
  assert.deepEqual(statements[1].values, [71, 10, 10]);
});
