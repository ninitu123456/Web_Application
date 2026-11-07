import test from 'node:test';
import assert from 'node:assert/strict';
import { hiddenItemSql } from '../utils/item-visibility.js';
import { adminVisibilityInput } from '../validation/admin.validation.js';
import { createAdminModerationService } from '../services/admin-moderation.service.js';
import { createAdminService } from '../services/admin.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { activityLogDto } from '../utils/admin-dto.js';
import { serve } from './helpers.js';
import { request } from './auth/helpers.js';

test('visibility requires a valid target and Unicode reason; SQL accepts only trusted column references', () => {
  for (const visibility of ['PUBLIC', 'HIDDEN']) assert.deepEqual(adminVisibilityInput({ visibility, reason: ' 😀 ' }), { visibility, reason: '😀' });
  for (const body of [{}, { visibility: 'DELETED', reason: 'x' }, { visibility: 'HIDDEN', reason: '' }, { visibility: 'HIDDEN', reason: '\ud800' }, { visibility: 'HIDDEN', reason: 'a'.repeat(1001) }, { visibility: 'HIDDEN', reason: 'x', userId: 1 }]) assert.throws(() => adminVisibilityInput(body), error => error.status === 400);
  assert.throws(() => hiddenItemSql('i.item_id; DELETE FROM items'));
  assert.match(hiddenItemSql(), /GROUP BY visibility_log.entity_id/);
  const service = createAdminModerationService(new Proxy({}, { get() { throw new Error('No repository access permitted'); } }));
  assert.throws(() => service.setItemVisibility({ role: 'USER' }, 1, { visibility: 'HIDDEN', reason: 'x' }), error => error.status === 403);
  const dto = activityLogDto({ log_id: 1, entity_type: 'ITEM', entity_id: 2, action: 'ITEM_HIDDEN', details: { previousVisibility: 'PUBLIC', visibility: 'HIDDEN', reason: 'reviewed', source: 'ADMIN_VISIBILITY', proof: 'SECRET' } });
  assert.deepEqual(dto.details, { previousVisibility: 'PUBLIC', visibility: 'HIDDEN', reason: 'reviewed', source: 'ADMIN_VISIBILITY' });
});

test('visibility HTTP validation and authorization fail before acquiring a database transaction', async () => {
  let acquisitions = 0;
  const pool = { async getConnection() { acquisitions++; throw new Error('Must not acquire'); } };
  const http = await serve({ healthService: { async check() {} }, userService: {}, authService: { async authenticate(token) { return { id: '9', role: token === 'user' ? 'USER' : 'ADMIN' }; } }, adminService: createAdminService(createAdminRepository(pool)) });
  try {
    const path = '/api/admin/items/1/visibility';
    const body = { visibility: 'HIDDEN', reason: 'reviewed' };
    assert.equal((await request(http, path, { method: 'PATCH', body })).status, 401);
    assert.equal((await request(http, path, { method: 'PATCH', body, token: 'user' })).status, 403);
    for (const [url, input] of [[path, {}], [path + '?visibility=PUBLIC', body], ['/api/admin/items/0/visibility', body], [path, { ...body, reason: '\udfff' }]]) {
      const result = await request(http, url, { method: 'PATCH', body: input, token: 'admin' });
      assert.equal(result.status, 400); assert.equal(result.headers.get('cache-control'), 'no-store');
    }
    assert.equal(acquisitions, 0);
  } finally { await http.close(); }
});
