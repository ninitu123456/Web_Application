import test from 'node:test';
import assert from 'node:assert/strict';
import { adminId, adminUserQuery, adminItemQuery, createLookupInput, updateLookupInput, accountStatusInput, adminItemStatusInput } from '../validation/admin.validation.js';
import { adminUserDto, lookupDto, dashboardNumber } from '../utils/admin-dto.js';
import { createAdminService } from '../services/admin.service.js';
import { createReportService } from '../services/report.service.js';
import { serve } from './helpers.js';
const admin = { id: '9', role: 'ADMIN' }, user = { id: '1', role: 'USER' };
const invalid = (fn) => assert.throws(fn, (error) => error.status === 400);
test('Admin validation strictly constrains IDs, pagination, filters, bodies, and supported states', () => {
  assert.equal(adminId('3'), 3); assert.deepEqual(adminUserQuery({ page: '2', limit: '5', accountStatus: 'SUSPENDED' }), { page: 2, limit: 5, accountStatus: 'SUSPENDED' });
  assert.deepEqual(adminItemQuery({ status: 'CLAIM_PENDING' }), { page: 1, limit: 10, status: 'CLAIM_PENDING' });
  for (const value of ['0', '01', '-1', '1e3', '9007199254740992']) invalid(() => adminId(value));
  for (const query of [{ page: '0' }, { extra: '1' }, { limit: '101' }, { accountStatus: 'BANNED' }]) invalid(() => adminUserQuery(query));
  for (const query of [{ type: 'OTHER' }, { status: 'DELETED' }]) invalid(() => adminItemQuery(query));
  assert.deepEqual(createLookupInput({ name: 'Library' }, 150), { name: 'Library' });
  assert.deepEqual(updateLookupInput({ isActive: false }, 100), { isActive: false });
  for (const body of [{ name: 'x', role: 'ADMIN' }, { name: '  ' }, {}, { isActive: 'false' }]) invalid(() => updateLookupInput(body, 100));
  assert.deepEqual(accountStatusInput({ status: 'SUSPENDED' }), { status: 'SUSPENDED' });
  invalid(() => accountStatusInput({ status: 'DELETED' })); invalid(() => adminItemStatusInput({ status: 'RETURNED' }));
});
test('Admin DTOs whitelist safe fields and count conversion is bounded', () => {
  const dto = adminUserDto({ user_id: '1', full_name: 'A', email: 'a@b.test', role: 'USER', account_status: 'ACTIVE', password_hash: 'secret', contact_info: 'private' });
  assert.deepEqual(Object.keys(dto), ['id', 'fullName', 'email', 'role', 'accountStatus', 'createdAt', 'updatedAt']);
  assert.equal(JSON.stringify(dto).includes('secret'), false); assert.equal(JSON.stringify(dto).includes('private'), false);
  assert.deepEqual(lookupDto({ category_id: '2', name: 'Keys', is_active: 0 }, 'category_id'), { id: 2, name: 'Keys', isActive: false });
  assert.equal(dashboardNumber(null), 0); assert.throws(() => dashboardNumber('9007199254740992'));
});
test('Empty dashboard datasets return stable zero totals and status buckets', async () => {
  const repository = { async dashboard() { return { users: { total: 0, active: null, suspended: null }, items: { total: 0, lost: null, found: null, returned: null }, claims: 0, matches: 0, reports: 0, itemStatuses: [], claimStatuses: [], reportStatuses: [], categories: [], recentActivity: [] }; } };
  const dashboard = await createAdminService(repository, {}).dashboard();
  assert.deepEqual(dashboard.users, { total: 0, active: 0, suspended: 0 });
  assert.deepEqual(dashboard.items.byStatus, { OPEN: 0, CLAIM_PENDING: 0, CLAIMED: 0, RETURNED: 0, CLOSED: 0 });
  assert.deepEqual(dashboard.claims.byStatus, { PENDING: 0, APPROVED: 0, REJECTED: 0, COMPLETED: 0 });
  assert.deepEqual(dashboard.reports.byStatus, { PENDING: 0, REVIEWING: 0, RESOLVED: 0, DISMISSED: 0 });
  assert.deepEqual(dashboard.recentActivity, []);
});test('Admin service maps aggregate dashboard and enforces safe status/mutation contracts', async () => {
  let changed = 0, closed = 0;
  const repository = {
    async dashboard() { return { users: { total: '2', active: '1', suspended: '1' }, items: { total: '4', lost: '2', found: '2', returned: '1' }, claims: '0', matches: '0', reports: '0', itemStatuses: [{ status: 'OPEN', total: '4' }], claimStatuses: [], reportStatuses: [], categories: [], recentActivity: [] }; },
    async listUsers() { return { rows: [{ user_id: '1', full_name: 'A', email: 'a@b.test', role: 'USER', account_status: 'ACTIVE' }], total: 1 }; },
    async findUser() { return { user_id: '1', full_name: 'A', email: 'a@b.test', role: 'USER', account_status: 'ACTIVE' }; },
    async setUserStatus(actor, id, status) { changed++; return { user_id: id, full_name: 'A', email: 'a@b.test', role: 'USER', account_status: status }; },
    async listLookup() { return []; }
  };
  const service = createAdminService(repository, { async list() { return { data: [], pagination: {} }; }, async get() { return {}; }, async close(identity, id) { closed++; return { id }; } });
  const dashboard = await service.dashboard(); assert.deepEqual(dashboard.items.byStatus, { OPEN: 4, CLAIM_PENDING: 0, CLAIMED: 0, RETURNED: 0, CLOSED: 0 }); assert.deepEqual(dashboard.claims.byStatus, { PENDING: 0, APPROVED: 0, REJECTED: 0, COMPLETED: 0 });
  assert.equal((await service.listUsers({ page: 1, limit: 10 })).data[0].password_hash, undefined);
  assert.equal((await service.setUserStatus(admin, 1, 'SUSPENDED')).accountStatus, 'SUSPENDED'); assert.equal(changed, 1);
  await service.closeItem(admin, 3); assert.equal(closed, 1);
});
test('Admin HTTP routes reject anonymous and USER identities, allow ADMIN, and validate requests', async () => {
  const calls = [];
  const adminService = { async dashboard() { calls.push('dashboard'); return { users: { total: 0 } }; }, async listUsers() { return { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }; }, async getUser(id) { return { id }; }, async setUserStatus(_identity, id, status) { return { id, accountStatus: status }; }, async listItems() { return { data: [], pagination: {} }; }, async getItem(id) { return { id }; }, async closeItem(_identity, id) { return { id, status: 'CLOSED' }; }, async listLookup() { return []; }, async createLookup(_identity, kind, input) { return { id: 1, kind, ...input }; }, async updateLookup(_identity, kind, id, input, deactivate) { return { id, kind, isActive: !deactivate, ...input }; } };
  const reportService = { async list() { return { data: [], pagination: {} }; }, async get(_identity, id) { return { id, reason: 'spam' }; } };
  const http = await serve({ healthService: { async check() { return {}; } }, authService: { async authenticate(token) { return token === 'admin' ? admin : token === 'user' ? user : null; } }, userService: {}, adminService, reportService });
  try {
    for (const path of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/categories', '/api/admin/reports', '/api/admin/reports/1']) assert.equal((await fetch(http.url + path)).status, 401);
    const header = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
    assert.equal((await fetch(http.url + '/api/admin/dashboard', { headers: header('user') })).status, 403);
    assert.equal((await fetch(http.url + '/api/admin/dashboard', { headers: header('admin') })).status, 200);
    assert.equal((await fetch(http.url + '/api/admin/users/1', { headers: header('admin') })).status, 200);
    assert.equal((await fetch(http.url + '/api/admin/users/1/status', { method: 'PATCH', headers: header('admin'), body: '{"status":"ADMIN","role":"ADMIN"}' })).status, 400);
    assert.equal((await fetch(http.url + '/api/admin/users/not-id', { headers: header('admin') })).status, 400);
    assert.equal((await fetch(http.url + '/api/admin/reports/1', { headers: header('user') })).status, 403);
    assert.equal((await fetch(http.url + '/api/admin/reports/1', { headers: header('admin') })).status, 200);
    const created = await fetch(http.url + '/api/admin/categories', { method: 'POST', headers: header('admin'), body: '{"name":"Keys"}' }); assert.equal(created.status, 201);
    assert.equal((await fetch(http.url + '/api/admin/categories', { headers: header('admin') })).headers.get('cache-control'), 'no-store');
  } finally { await http.close(); }
});
test('Report admin detail preserves current safe report contract and rejects non-admin service calls', async () => {
  const service = createReportService({ async findById() { return { report_id: '7', reporter_id: '2', target_type: 'CLAIM', claim_id: '3', reason: 'spam', description: 'x', status: 'PENDING', proof_description: 'secret' }; } });
  const result = await service.get(admin, 7); assert.equal(result.id, 7); assert.equal(JSON.stringify(result).includes('secret'), false);
  await assert.rejects(() => service.get(user, 7), (error) => error.status === 403);
});


