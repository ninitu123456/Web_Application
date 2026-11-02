import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers.js';
import { createClaimRepository } from '../repositories/claim.repository.js';

test('F09: all three list routes validate pagination before service work and preserve array envelopes', async () => {
  const calls = [];
  const list = async (...args) => { const options = args.at(-1); calls.push(options); return { data: [], pagination: { ...options, total: 0, totalPages: 0 } }; };
  const http = await serve({ healthService: { check() {} }, authService: { async authenticate() { return { id: '7', role: 'USER' }; } }, userService: {}, itemService: {}, claimService: { mine: list, forItem: list }, matchingService: { list } });
  try {
    for (const route of ['/api/claims/mine', '/api/items/1/claims', '/api/items/1/matches']) {
      const get = (query = '') => fetch(http.url + route + query, { headers: { Authorization: 'Bearer valid' } });
      for (const query of ['?page=0', '?limit=101', '?page=1&page=2', '?page[]=1', '?page=1e2', '?limit=1.5', '?page=100002&limit=1', '?page=9007199254740991&limit=100', '?sort=bad', '?page=1%20OR%201=1']) {
        const before = calls.length; assert.equal((await get(query)).status, 400, route + query); assert.equal(calls.length, before);
      }
      const response = await get(); assert.equal(response.status, 200);
      const body = await response.json(); assert.ok(Array.isArray(body.data));
      assert.deepEqual(body.pagination, { page: 1, limit: 10, total: 0, totalPages: 0 });
      assert.deepEqual(calls.at(-1), { page: 1, limit: 10 });
      await get('?page=1001&limit=100'); assert.deepEqual(calls.at(-1), { page: 1001, limit: 100 });
    }
  } finally { await http.close(); }
});

test('F09: Claim mine limits rows in SQL and counts on the same session', async () => {
  const statements = []; let acquisitions = 0;
  const connection = {
    async query(statement, values) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      statements.push({ sql, values });
      if (/COUNT/.test(sql)) return [[{ total: 250 }]];
      return [[]];
    }, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, destroy() {}
  };
  const repository = createClaimRepository({ async getConnection() { acquisitions++; return connection; } });
  const result = await repository.listMine('7', { page: 2, limit: 10 });
  const page = statements.find(({ sql }) => /SELECT.*c.claim_id/.test(sql));
  assert.match(page.sql, /LIMIT \? OFFSET \?/); assert.deepEqual(page.values.slice(-2), [10, 10]);
  assert.equal(result.total, 250); assert.deepEqual(result.rows, []); assert.equal(acquisitions, 1);
});
