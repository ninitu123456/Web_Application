import test from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './helpers.js';
import { request } from './auth/helpers.js';
import { adminCloseInput, adminResolveInput, adminId } from '../validation/admin.validation.js';
import { activityLogDto, adminClaimDto } from '../utils/admin-dto.js';
import { createAdminModerationService } from '../services/admin-moderation.service.js';
import { createAdminService } from '../services/admin.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';

const malformedReasons = ['\ud800', '\udfff', 'a\ud800b', '\udfff\ud800', '\ud800\ud800', '\ud83d\ude00\udfff'];
test('Unicode reason rejects unpaired surrogates and preserves valid pairs and approved boundaries', () => {
  for (const reason of malformedReasons) {
    assert.throws(() => adminCloseInput({ reason }), (e) => e.status === 400);
    for (const decision of ['APPROVE', 'REJECT']) assert.throws(() => adminResolveInput({ reason, decision }), (e) => e.status === 400);
  }
  for (const reason of ['Lý do hợp lệ', '\ud83d\ude00', 'a😀b', '😀'.repeat(1000), 'đ'.repeat(1000)]) {
    assert.equal(adminCloseInput({ reason }).reason, reason);
    for (const decision of ['APPROVE', 'REJECT']) assert.equal(adminResolveInput({ reason, decision }).reason, reason);
  }
  for (const reason of ['😀'.repeat(1001), 'a'.repeat(1001)]) assert.throws(() => adminCloseInput({ reason }), (e) => e.status === 400);
});

test('Unicode reason HTTP rejection precedes transaction acquisition for close and both resolve decisions', async () => {
  let acquisitions = 0;
  const pool = { async getConnection() { acquisitions++; throw new Error('Invalid input must not acquire a connection'); } };
  const http = await serve({ healthService: { async check() {} }, authService: { async authenticate() { return { id: '9', role: 'ADMIN' }; } }, userService: {}, adminService: createAdminService(createAdminRepository(pool)) });
  try {
    for (const reason of malformedReasons) for (const [path, body] of [
      ['/items/1/close', { reason }],
      ['/claims/1/resolve', { reason, decision: 'APPROVE' }],
      ['/claims/1/resolve', { reason, decision: 'REJECT' }]
    ]) {
      const result = await request(http, '/api/admin' + path, { token: 'valid', method: 'PATCH', body });
      assert.equal(result.status, 400, `${path}: ${JSON.stringify(body)}`);
      assert.deepEqual(result.json, { success: false, message: 'Dữ liệu yêu cầu không hợp lệ' });
    }
    assert.equal(acquisitions, 0);
  } finally { await http.close(); }
});

test('moderation validation counts Unicode code points; DTOs remove nested secrets and operational fields', () => {
  assert.equal(adminCloseInput({ reason: ' 😀 '.repeat(1).trim() }).reason, '😀');
  assert.equal(adminCloseInput({ reason: '😀'.repeat(1000) }).reason.length, 2000);
  for (const reason of ['😀'.repeat(1001), 'a'.repeat(1001), '', '   ', null, 1]) assert.throws(() => adminCloseInput({ reason }), (e) => e.status === 400);
  for (const value of ['0', '-1', '01', '9007199254740992', '1e2', '1 OR 1=1']) assert.throws(() => adminId(value), (e) => e.status === 400);
  assert.throws(() => adminResolveInput({ decision: 'APPROVE', reason: 'OK', reviewedAt: 'now' }), (e) => e.status === 400);
  const row = { log_id: '1', user_id: null, entity_id: null, entity_type: 'CLAIM', action: 'CLAIM_REJECTED', details: { status: 'REJECTED', itemId: '2', automatic: true, proof: 'SECRET', reason: 'SECRET', source: { token: 'SECRET' }, decisionLogId: '3' } };
  const value = activityLogDto(row); assert.deepEqual(value.details, { status: 'REJECTED', itemId: 2, automatic: true, decisionLogId: 3 }); assert.ok(!JSON.stringify(value).includes('SECRET'));
  assert.deepEqual(activityLogDto({ ...row, details: '{broken' }).details, {});
  const claim = adminClaimDto({ claim_id: 1, item_id: 2, claimant_id: 3, item_user_id: 4, item_title: 'Public', item_type: 'FOUND', item_status: 'OPEN', proof_description: 'SECRET', email: 'SECRET' });
  assert.ok(!JSON.stringify(claim).includes('SECRET')); assert.equal(claim.reviewedAt, null);
});

test('all moderation service entrypoints reject non-admin before accessing the repository', () => {
  const service = createAdminModerationService(new Proxy({}, { get() { throw new Error('Repository must not run'); } }));
  for (const operation of [() => service.listClaims({ role: 'USER' }, {}), () => service.activityLogs(null, {}), () => service.moderateClose({ role: 'USER' }, 1, { reason: 'x' }), () => service.resolveClaim({ role: 'USER' }, 1, { reason: 'x', decision: 'APPROVE' })]) assert.throws(operation, (e) => e.status === 403);
});

test('F04/F05: four canonical admin routes validate and dispatch without changing legacy close', async () => {
  const calls = [];
  const service = {
    async listClaims(actor, query) { calls.push(['claims', actor.id, query]); return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }; },
    async activityLogs(actor, query) { calls.push(['logs', actor.id, query]); return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }; },
    async resolveClaim(actor, id, input) { calls.push(['resolve', actor.id, id, input]); return { claim: { id, status: 'APPROVED' } }; },
    async moderateClose(actor, id, input) { calls.push(['close', actor.id, id, input]); return { item: { id, status: 'CLOSED' }, rejectedClaimCount: 2 }; },
    async closeItem() { calls.push(['legacy']); return { status: 'CLOSED' }; }
  };
  const http = await serve({ healthService: { async check() {} }, authService: { async authenticate() { return { id: '9', role: 'ADMIN' }; } }, userService: {}, adminService: service });
  try {
    const api = (path, options) => request(http, '/api/admin' + path, { token: 'valid', ...options });
    for (const path of ['/claims', '/activity-logs']) {
      const res = await api(path); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store'); assert.equal(res.json.pagination.total, 0);
    }
    assert.equal((await api('/claims/1/resolve', { method: 'PATCH', body: { decision: 'APPROVE', reason: ' Reviewed ' } })).status, 200);
    assert.equal((await api('/items/1/close', { method: 'PATCH', body: { reason: ' Review ' } })).json.data.rejectedClaimCount, 2);
    assert.equal((await api('/items/1/status', { method: 'PATCH', body: { status: 'CLOSED' } })).status, 200);
    assert.deepEqual(calls.map((c) => c[0]), ['claims', 'logs', 'resolve', 'close', 'legacy']);
    assert.equal(calls[2][3].reason, 'Reviewed');
    for (const body of [{}, { reason: ' ' }, { reason: 'x', actorId: 1 }, { reason: 'x'.repeat(1001) }]) assert.equal((await api('/items/1/close', { method: 'PATCH', body })).status, 400);
    for (const body of [{ reason: 'x', decision: 'COMPLETE' }, { reason: 'x', decision: 'APPROVE', status: 'APPROVED' }]) assert.equal((await api('/claims/1/resolve', { method: 'PATCH', body })).status, 400);
    for (const path of ['/claims?proof=true', '/claims?sort=DESC', '/claims?limit=101', '/claims?page=9007199254740991&limit=100', '/activity-logs?action=IMAGE_OPERATION_STARTED', '/activity-logs?dateFrom=2026-02-30', '/activity-logs?dateFrom=2026-02-02&dateTo=2026-01-01']) assert.equal((await api(path)).status, 400, path);
    assert.equal(calls.length, 5);
  } finally { await http.close(); }
});
