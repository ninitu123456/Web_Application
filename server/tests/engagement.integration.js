import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
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
import { createUserRepository } from '../repositories/user.repository.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createEngagementRepository } from '../repositories/engagement.repository.js';
import { createItemService } from '../services/item.service.js';
import { createClaimService } from '../services/claim.service.js';
import { createEngagementService } from '../services/engagement.service.js';
import { createChatService } from '../services/chat.service.js';
import { createChatRepository } from '../repositories/chat.repository.js';
import { createAuthService } from '../services/auth.service.js';
import { createAdminService } from '../services/admin.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createUserService } from '../services/user.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createApp } from '../app.js';
import { serveApp, request } from './auth/helpers.js';

test('Phase 2 integration: verification questions, saved items, views, stats, contact and handover', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Use npm run test:integration:isolated');
  const base = configFromEnv(), adminConnection = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let created = false, pool, http;
  try {
    const [[instance]] = await adminConnection.query('SELECT @@datadir AS directory');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR));
    await adminConnection.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await adminConnection.query(`USE ${quote(name)}`); await migrate(adminConnection, name);
    const password = randomBytes(18).toString('hex');
    await seed(adminConnection, name, { USER: { email: 'owner@phase2.test', password }, ADMIN: { email: 'admin@phase2.test', password } });
    pool = createDbPool({ ...base, database: name });
    const users = createUserRepository(pool), auth = createAuthService(users, createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
    http = await serveApp(createApp({
      healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users),
      itemService: createItemService(createItemRepository(pool)), claimService: createClaimService(createClaimRepository(pool)),
      engagementService: createEngagementService(createEngagementRepository(pool)), chatService: createChatService(createChatRepository(pool)), adminService: createAdminService(createAdminRepository(pool), createItemService(createItemRepository(pool))), logger: () => {}, security: { contactMax: 3 }
    }));
    const login = async (email) => (await request(http, '/api/auth/login', { method: 'POST', body: { email, password } })).json.data;
    const owner = await login('owner@phase2.test'), admin = await login('admin@phase2.test');
    assert.equal((await request(http, '/api/auth/register', { method: 'POST', body: { fullName: 'Người nhận', email: 'claimant@phase2.test', password, confirmPassword: password } })).status, 201);
    const claimant = await login('claimant@phase2.test');
    const [[category]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
    const itemBody = (type, extra = {}) => ({ title: 'Ví da nâu', type, categoryId: Number(category.category_id), locationId: Number(location.location_id), eventDate: '2026-10-20', description: 'Nhặt ở thư viện', ...extra });
    let foundId, questionIds, claimId;

    await t.test('FOUND items accept up to three public questions; LOST items reject them', async () => {
      const lost = await request(http, '/api/items', { method: 'POST', token: owner.token, body: itemBody('LOST', { verificationQuestions: ['Màu gì?'] }) });
      assert.equal(lost.status, 400);
      assert.equal((await request(http, '/api/items', { method: 'POST', token: owner.token, body: itemBody('FOUND', { verificationQuestions: ['a', 'b', 'c', 'd'] }) })).status, 400);
      const found = await request(http, '/api/items', { method: 'POST', token: owner.token, body: itemBody('FOUND', { verificationQuestions: ['Bên trong có gì?', ' Màu dây kéo? '] }) });
      assert.equal(found.status, 201);
      foundId = found.json.data.id;
      assert.deepEqual(found.json.data.verificationQuestions.map((q) => q.question), ['Bên trong có gì?', 'Màu dây kéo?']);
      const detail = await request(http, `/api/items/${foundId}`);
      questionIds = detail.json.data.verificationQuestions.map((q) => q.id);
      assert.equal(questionIds.length, 2);
      const edited = await request(http, `/api/items/${foundId}`, { method: 'PATCH', token: owner.token, body: { verificationQuestions: ['Bên trong có gì?'] } });
      assert.equal(edited.status, 200); assert.equal(edited.json.data.verificationQuestions.length, 1);
      const restored = await request(http, `/api/items/${foundId}`, { method: 'PATCH', token: owner.token, body: { verificationQuestions: ['Bên trong có gì?', 'Màu dây kéo?'] } });
      questionIds = restored.json.data.verificationQuestions.map((q) => q.id);
    });

    await t.test('claims must answer every question and answers stay private to the owner', async () => {
      const path = `/api/items/${foundId}/claims`;
      assert.equal((await request(http, path, { method: 'POST', token: claimant.token, body: { proofDescription: 'Ví của tôi' } })).status, 400);
      const secret = `answer-${randomBytes(8).toString('hex')}`;
      const answers = [{ questionId: questionIds[0], answer: secret }, { questionId: questionIds[1], answer: 'Đỏ' }];
      const created = await request(http, path, { method: 'POST', token: claimant.token, body: { proofDescription: 'Ví của tôi', answers } });
      assert.equal(created.status, 201);
      claimId = created.json.data.id;
      const ownerView = await request(http, path, { token: owner.token });
      assert.equal(ownerView.json.data[0].answers[0].answer, secret);
      assert.equal(JSON.stringify((await request(http, `/api/items/${foundId}`)).json).includes(secret), false);
      assert.equal((await request(http, `/api/items/${foundId}`, { method: 'PATCH', token: owner.token, body: { verificationQuestions: [] } })).status, 400, 'item is no longer OPEN');
    });

    await t.test('saving, views and stats', async () => {
      assert.equal((await request(http, `/api/saved-items/${foundId}`, { method: 'PUT' })).status, 401);
      assert.equal((await request(http, `/api/saved-items/${foundId}`, { method: 'PUT', token: owner.token })).status, 400);
      for (let i = 0; i < 2; i++) assert.equal((await request(http, `/api/saved-items/${foundId}`, { method: 'PUT', token: claimant.token })).status, 200);
      assert.deepEqual((await request(http, '/api/saved-items/ids', { token: claimant.token })).json.data, [foundId]);
      const list = await request(http, '/api/saved-items', { token: claimant.token });
      assert.equal(list.json.pagination.total, 1); assert.equal(list.json.data[0].id, foundId); assert.ok(list.json.data[0].savedAt);
      assert.equal((await request(http, `/api/items/${foundId}/views`, { method: 'POST', token: owner.token })).json.data.counted, false);
      assert.equal((await request(http, `/api/items/${foundId}/views`, { method: 'POST', token: claimant.token })).json.data.counted, true);
      assert.equal((await request(http, `/api/items/${foundId}/views`, { method: 'POST', token: claimant.token })).json.data.counted, false);
      assert.equal((await request(http, `/api/items/${foundId}/views`, { method: 'POST' })).json.data.counted, true);
      assert.equal((await request(http, `/api/items/${foundId}/stats`, { token: claimant.token })).status, 403);
      assert.deepEqual((await request(http, `/api/items/${foundId}/stats`, { token: owner.token })).json.data, { views: 2, saves: 1, claims: 1, pendingClaims: 1 });
      const mine = (await request(http, '/api/users/me/stats', { token: owner.token })).json.data;
      assert.equal(mine.posts.found, 1); assert.equal(mine.incomingPendingClaims, 1); assert.equal(mine.totalViews, 2);
      assert.equal((await request(http, '/api/users/me/stats', { token: claimant.token })).json.data.savedItems, 1);
      assert.equal((await request(http, `/api/saved-items/${foundId}`, { method: 'DELETE', token: claimant.token })).json.data.saved, false);
      assert.deepEqual((await request(http, '/api/saved-items/ids', { token: claimant.token })).json.data, []);
    });

    await t.test('contact form stores messages, admins handle them, and it is rate limited', async () => {
      const body = { fullName: 'Khách', email: 'guest@example.com', topic: 'GENERAL', body: 'Xin chào ban quản trị' };
      assert.equal((await request(http, '/api/contact', { method: 'POST', body: { ...body, email: 'bad' } })).status, 400);
      const sent = await request(http, '/api/contact', { method: 'POST', body });
      assert.equal(sent.status, 201); assert.equal(sent.json.data.userId, null);
      assert.equal((await request(http, '/api/contact', { method: 'POST', token: claimant.token, body: { ...body, topic: 'ITEM' } })).json.data.userId, claimant.user.id);
      assert.equal((await request(http, '/api/admin/contact-messages', { token: owner.token })).status, 403);
      const inbox = await request(http, '/api/admin/contact-messages?status=NEW', { token: admin.token });
      assert.equal(inbox.json.pagination.total, 2);
      assert.equal((await request(http, '/api/admin/queue', { token: owner.token })).status, 403);
      assert.equal((await request(http, '/api/admin/queue', { token: admin.token })).json.data.contacts, 2);
      const handled = await request(http, `/api/admin/contact-messages/${sent.json.data.id}/handle`, { method: 'PATCH', token: admin.token });
      assert.equal(handled.json.data.status, 'HANDLED');
      assert.equal((await request(http, '/api/admin/contact-messages?status=NEW', { token: admin.token })).json.pagination.total, 1);
      await request(http, '/api/contact', { method: 'POST', body });
      assert.equal((await request(http, '/api/contact', { method: 'POST', body })).status, 429);
    });

    await t.test('handover: appointment, dispute, two-sided confirmation completes the claim', async () => {
      const base = `/api/claims/${claimId}/handover`;
      assert.equal((await request(http, base, { token: claimant.token })).status, 409, 'pending claims have no handover');
      assert.equal((await request(http, `/api/claims/${claimId}/approve`, { method: 'PATCH', token: owner.token })).status, 200);
      assert.equal((await request(http, base, { token: admin.token })).status, 200);
      const soon = new Date(Date.now() + 86400000).toISOString();
      assert.equal((await request(http, `${base}/appointment`, { method: 'PUT', token: claimant.token, body: { appointmentAt: '2020-01-01T00:00:00Z', place: 'Sảnh A' } })).status, 400);
      const proposed = await request(http, `${base}/appointment`, { method: 'PUT', token: claimant.token, body: { appointmentAt: soon, place: 'Sảnh tòa A' } });
      assert.equal(proposed.status, 200); assert.equal(proposed.json.data.appointment.status, 'PROPOSED');
      assert.equal((await request(http, `${base}/appointment/accept`, { method: 'PATCH', token: claimant.token })).status, 409);
      assert.equal((await request(http, `${base}/appointment/accept`, { method: 'PATCH', token: owner.token })).json.data.appointment.status, 'ACCEPTED');
      assert.equal((await request(http, `${base}/dispute`, { method: 'POST', token: claimant.token, body: { reason: 'Người nhặt không đến' } })).status, 200);
      assert.equal((await request(http, `${base}/confirm`, { method: 'PATCH', token: owner.token })).status, 409);
      assert.equal((await request(http, `/api/claims/${claimId}/complete`, { method: 'PATCH', token: owner.token })).status, 409);
      const disputes = await request(http, '/api/admin/handover-disputes', { token: admin.token });
      assert.equal(disputes.json.data[0].claimId, claimId); assert.equal(disputes.json.data[0].reason, 'Người nhặt không đến');
      assert.equal((await request(http, `/api/admin/handover-disputes/${claimId}/resolve`, { method: 'PATCH', token: admin.token })).status, 200);
      assert.equal((await request(http, '/api/admin/handover-disputes', { token: admin.token })).json.pagination.total, 0);
      const first = await request(http, `${base}/confirm`, { method: 'PATCH', token: owner.token });
      assert.equal(first.json.data.claimStatus, 'APPROVED'); assert.ok(first.json.data.ownerConfirmedAt);
      const second = await request(http, `${base}/confirm`, { method: 'PATCH', token: claimant.token });
      assert.equal(second.json.data.claimStatus, 'COMPLETED');
      const [[item]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [foundId]);
      assert.equal(item.status, 'RETURNED');
      assert.equal((await request(http, `${base}/confirm`, { method: 'PATCH', token: claimant.token })).status, 409);
      const [[{ n }]] = await query(pool, "SELECT COUNT(*) AS n FROM notifications WHERE type='CLAIM_COMPLETED'");
      assert.equal(Number(n), 1);
    });

    await t.test('conversation context lists the Claim and items mentioned as "tin #N"', async () => {
      const lost = await request(http, '/api/items', { method: 'POST', token: claimant.token, body: itemBody('LOST') });
      const chat = await request(http, '/api/conversations', { method: 'POST', token: owner.token, body: { userId: Number(claimant.user.id) } });
      const chatId = chat.json.data.id;
      await request(http, `/api/conversations/${chatId}/messages`, { method: 'POST', token: owner.token, body: { clientId: '0b4c1f9e-1111-4a2b-9c3d-123456789abc', content: `Mình nhặt được (tin #${lost.json.data.id}) và (tin #${foundId})` } });
      assert.equal((await request(http, `/api/conversations/${chatId}/context`, { token: admin.token })).status, 404);
      const context = (await request(http, `/api/conversations/${chatId}/context`, { token: owner.token })).json.data;
      assert.equal(context.peer.fullName, 'Người nhận');
      assert.equal(context.threads.length, 2);
      assert.equal(context.threads[0].claim.id, Number(claimId));
      assert.equal(context.threads[0].role, 'OWNER');
      assert.equal(context.threads[0].handover.claimStatus, 'COMPLETED');
      assert.equal(context.threads[1].item.id, Number(lost.json.data.id));
      assert.equal(context.threads[1].role, 'FINDER');
    });
  } finally {
    if (http) await http.close();
    if (pool) await pool.end();
    if (created) await adminConnection.query(`DROP DATABASE ${quote(name)}`);
    await adminConnection.end();
  }
});
