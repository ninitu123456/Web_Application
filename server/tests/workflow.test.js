import test from 'node:test';
import assert from 'node:assert/strict';
import { pagination, reportQuery, workflowId, createReportInput, updateReportInput } from '../validation/workflow.validation.js';
import { notificationDto, reportDto } from '../utils/workflow-dto.js';
import { createNotificationService } from '../services/notification.service.js';
import { createNotificationRepository } from '../repositories/notification.repository.js';
import { createReportService } from '../services/report.service.js';
import { serve } from './helpers.js';

const user = { id: '1', role: 'USER' }, admin = { id: '9', role: 'ADMIN' };
const invalid = (fn) => assert.throws(fn, (error) => error.status === 400);
test('Zod workflow validation strictly constrains IDs, pagination, states and UTF-8 evidence-free report inputs', () => {
  assert.deepEqual(pagination({}), { page: 1, limit: 10 });
  assert.deepEqual(reportQuery({ status: 'PENDING', page: '2', limit: '5' }), { status: 'PENDING', page: 2, limit: 5 });
  for (const id of ['0', '-1', '1e3', '01', '1 OR 1=1', '9007199254740992']) invalid(() => workflowId(id));
  for (const query of [{ limit: '101' }, { page: ['1'] }, { userId: '2' }, { page: '9007199254740991', limit: '100' }]) invalid(() => pagination(query));
  const good = { targetType: 'ITEM', targetId: 1, reason: '  wrong info  ' };
  assert.equal(createReportInput(good).reason, 'wrong info');
  for (const body of [null, [], {}, { ...good, targetId: '1' }, { ...good, reporterId: 2 }, { ...good, reason: ' ' }, { ...good, reason: 'a'.repeat(51) }, { ...good, description: '' }, { ...good, description: 'a'.repeat(65536) }]) invalid(() => createReportInput(body));
  const emoji = String.fromCodePoint(0x1f600);
  assert.equal(createReportInput({ ...good, reason: emoji.repeat(50), description: emoji.repeat(16383) }).reason, emoji.repeat(50));
  invalid(() => createReportInput({ ...good, description: emoji.repeat(16384) }));
  for (const body of [{ status: 'REJECTED' }, { status: 'PENDING' }, { status: 'RESOLVED', reviewedBy: 9 }]) invalid(() => updateReportInput(body));
});

test('Notification DTO and Report DTO whitelist public fields and refuse unsafe IDs', () => {
  const row = { notification_id: '1', type: 'NEW_MATCH', message: 'public', is_read: '0', created_at: new Date(), event_key: 'hidden', proof_description: 'secret' };
  const dto = notificationDto(row);
  assert.equal(dto.isRead, false); assert.equal(JSON.stringify(dto).includes('hidden'), false); assert.equal(JSON.stringify(dto).includes('secret'), false);
  assert.throws(() => notificationDto({ ...row, notification_id: '9007199254740992' }));
  const report = reportDto({ report_id: '1', reporter_id: '2', target_type: 'ITEM', item_id: '3', status: 'PENDING', reason: 'x', active_target_key: 'hidden', password_hash: 'secret' });
  assert.equal(report.targetId, 3); assert.equal(report.reviewedBy, null); assert.equal(JSON.stringify(report).includes('secret'), false);
});

test('Notification emission deduplicates recipients, orders locks, and never accepts unknown events', async () => {
  const calls = [], service = createNotificationService({ async insert(...args) { calls.push(args); } });
  await service.emit('NEW_MATCH', '7', ['20', '3', 20]);
  assert.deepEqual(calls.map((call) => call[0]), ['3', '20']);
  assert.ok(calls.every((call) => call[3] === 'NEW_MATCH:7'));
  await assert.rejects(() => service.emit('BAD_EVENT', 7, [1]), /Unknown/);
});

test('Notification ownership, idempotent reads, count and pagination are enforced', async () => {
  let updates = 0;
  const service = createNotificationService({
    async owner(id) { return id === 404 ? undefined : id === 2 ? '2' : '1'; },
    async markRead(id) { assert.equal(id, '1'); updates++; }, async markAll(id) { assert.equal(id, '1'); },
    async unread() { return '2'; }, async list() { return { rows: [], total: 0 }; }
  });
  await assert.rejects(() => service.markRead(user, 404), (e) => e.status === 404);
  await assert.rejects(() => service.markRead(user, 2), (e) => e.status === 403);
  await service.markRead(user, 1); await service.markRead(user, 1); assert.equal(updates, 2);
  await service.markAll(user); assert.deepEqual(await service.unread(user), { unreadCount: 2 });
  assert.equal((await service.list(user, { page: 1, limit: 10 })).pagination.total, 0);
});

test('Notification insert suppresses only its own duplicate key; propagates FK/other SQL failures', async () => {
  for (const [error, ignored] of [
    [{ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate for key 'notifications.uq_notifications_user_event'" }, true],
    [{ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate for key 'PRIMARY'" }, false],
    [{ code: 'ER_NO_REFERENCED_ROW_2' }, false]
  ]) {
    const repository = createNotificationRepository(null, async () => { throw error; });
    if (ignored) await repository.insert(1, 'NEW_MATCH', 'message', 'NEW_MATCH:1');
    else await assert.rejects(() => repository.insert(1, 'NEW_MATCH', 'message', 'NEW_MATCH:1'), (e) => e === error);
  }
});

test('Report service protects Claim targets and translates only active duplicate errors', async () => {
  let target, failure;
  const source = {
    async target() { return target; }, async create() { throw failure; }
  };
  const service = createReportService({ async withTransaction(fn) { return fn(source); } });
  const input = { targetType: 'CLAIM', targetId: 1, reason: 'x' };
  await assert.rejects(() => service.create(user, input), (e) => e.status === 404);
  target = { claimant_id: '2', user_id: '3' };
  await assert.rejects(() => service.create(user, input), (e) => e.status === 403);
  target.claimant_id = '1'; failure = { code: 'ER_DUP_ENTRY', sqlMessage: 'uq_reports_active_target' };
  await assert.rejects(() => service.create(user, input), (e) => e.status === 409);
  failure = new Error('database failure'); await assert.rejects(() => service.create(admin, input), /database failure/);
});

test('Report state machine disallows skipping, repeats, reopening and nonadmin processing', async () => {
  let state = 'PENDING', events = [];
  const row = () => ({ report_id: 1, reporter_id: 1, target_type: 'ITEM', item_id: 2, reason: 'x', status: state });
  const source = { async findForUpdate() { return row(); }, async update(id, from, to) { assert.equal(from, state); state = to; return 1; }, async audit(actor, id, from, to) { events.push([from, to]); } };
  const service = createReportService({ async withTransaction(fn) { return fn(source); } });
  await assert.rejects(() => service.update(user, 1, { status: 'REVIEWING' }), (e) => e.status === 403);
  await assert.rejects(() => service.update(admin, 1, { status: 'RESOLVED' }), (e) => e.status === 409);
  await service.update(admin, 1, { status: 'REVIEWING' });
  await assert.rejects(() => service.update(admin, 1, { status: 'REVIEWING' }), (e) => e.status === 409);
  await service.update(admin, 1, { status: 'DISMISSED' });
  await assert.rejects(() => service.update(admin, 1, { status: 'REVIEWING' }), (e) => e.status === 409);
  assert.deepEqual(events, [['PENDING', 'REVIEWING'], ['REVIEWING', 'DISMISSED']]);
});

test('HTTP workflow routes require auth, protect admin routes, validate bodies and disable caches', async () => {
  const http = await serve({ healthService: { async check() { return {}; } },
    authService: { async authenticate(token) { return token === 'admin' ? admin : user; } }, userService: {},
    notificationService: { async unread() { return { unreadCount: 0 }; } }, reportService: {} });
  try {
    for (const path of ['/api/notifications', '/api/notifications/unread-count', '/api/reports/mine', '/api/admin/reports']) assert.equal((await fetch(http.url + path)).status, 401);
    const headers = { Authorization: 'Bearer user', 'Content-Type': 'application/json' };
    assert.equal((await fetch(http.url + '/api/admin/reports', { headers })).status, 403);
    assert.equal((await fetch(http.url + '/api/admin/reports/1', { method: 'PATCH', headers, body: '{"status":"RESOLVED"}' })).status, 403);
    assert.equal((await fetch(http.url + '/api/reports', { method: 'POST', headers, body: '{"reporterId":9}' })).status, 400);
    const response = await fetch(http.url + '/api/notifications/unread-count', { headers });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally { await http.close(); }
});
