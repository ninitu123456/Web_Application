import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateClaim } from '../validation/claim.validation.js';
import { createClaimService } from '../services/claim.service.js';
import { serve } from './helpers.js';

const owner = { id: '10', role: 'USER' }, claimant = { id: '20', role: 'USER' }, unrelated = { id: '30', role: 'USER' };

function fixture({ itemType = 'FOUND', status = 'OPEN' } = {}) {
  const item = { item_id: '4', user_id: owner.id, type: itemType, status };
  const claims = [];
  const logs = [];
  let nextId = 1;
  const repository = {
    async findClaimItemId(id) { return claims.find((claim) => claim.claim_id === String(id))?.item_id; },
    async listMine(userId) { return claims.filter((claim) => claim.claimant_id === String(userId)).map((claim) => ({ ...claim, item_title: 'Found keys', item_type: 'FOUND', item_status: item.status, item_event_date: '2026-10-20', category_name: 'Keys', location_name: 'Library' })); },
    async withLockedItem(id, operation) {
      if (String(id) !== item.item_id) return operation(undefined);
      const source = {
        async findItem() { return item; },
        async findClaimForUpdate(claimId) { return claims.find((claim) => claim.claim_id === String(claimId)); },
        async findClaimByClaimant(userId) { return claims.find((claim) => claim.claimant_id === String(userId)); },
        async activeClaimExists(exceptId = null) { return claims.some((claim) => claim.claim_id !== String(exceptId) && ['APPROVED', 'COMPLETED'].includes(claim.status)); },
        async createClaim(userId, proof) {
          const claim = { claim_id: String(nextId++), claimant_id: String(userId), item_id: item.item_id, proof_description: proof, status: 'PENDING', submitted_at: '2026-10-29T00:00:00.000Z', reviewed_at: null, completed_at: null };
          claims.push(claim); item.status = 'CLAIM_PENDING'; return claim;
        },
        async listForItem() { return claims.map((claim) => ({ ...claim, claimant_name: `Person ${claim.claimant_id}` })); },
        async updateClaim(id, from, to, field) {
          const claim = claims.find((entry) => entry.claim_id === String(id));
          if (!claim || claim.status !== from) return 0;
          claim.status = to; claim[field] = '2026-10-29T00:00:00.000Z'; return 1;
        },
        async rejectOtherPending(selectedId) {
          const changed = [];
          for (const claim of claims) if (claim.claim_id !== String(selectedId) && claim.status === 'PENDING') { claim.status = 'REJECTED'; claim.reviewed_at = '2026-10-29T00:00:00.000Z'; changed.push(claim.claim_id); }
          return changed;
        },
        async resetItemOpen() { if (!claims.some((claim) => ['PENDING', 'APPROVED'].includes(claim.status))) item.status = 'OPEN'; },
        async claimItem() { if (item.status !== 'CLAIM_PENDING') return 0; item.status = 'CLAIMED'; return 1; },
        async returnItem() { if (item.status !== 'CLAIMED') return 0; item.status = 'RETURNED'; return 1; },
        async audit(userId, action, claimId, details) { logs.push({ userId, action, claimId, details }); }
      };
      return operation(source);
    }
  };
  return { item, claims, logs, service: createClaimService(repository) };
}

test('Claim validation requires trimmed evidence and forbids client-selected fields', () => {
  assert.deepEqual(validateCreateClaim({ proofDescription: '  private evidence  ' }), { proofDescription: 'private evidence' });
  for (const bad of [undefined, null, {}, { proofDescription: '  ' }, { proofDescription: 'ok', status: 'APPROVED' }, { proofDescription: 3 }]) {
    assert.throws(() => validateCreateClaim(bad), (error) => error.status === 400);
  }
});

test('creation requires FOUND/open-capable, blocks self, and permanently prevents duplicate claimant-item pairs', async () => {
  const lost = fixture({ itemType: 'LOST' });
  await assert.rejects(() => lost.service.create(claimant, 4, { proofDescription: 'proof' }), (error) => error.status === 400);
  const found = fixture();
  await assert.rejects(() => found.service.create(owner, 4, { proofDescription: 'proof' }), (error) => error.status === 403);
  const first = await found.service.create(claimant, 4, { proofDescription: 'serial number on the back' });
  assert.equal(first.status, 'PENDING'); assert.equal(found.item.status, 'CLAIM_PENDING');
  await found.service.reject(owner, first.id);
  await assert.rejects(() => found.service.create(claimant, 4, { proofDescription: 'another proof' }), (error) => error.status === 409);
  assert.equal(found.claims.length, 1);
});

test('item state, approved Claim, and existing Claim rules are enforced', async () => {
  for (const status of ['RETURNED', 'CLOSED', 'CLAIMED']) {
    const state = fixture({ status });
    await assert.rejects(() => state.service.create(claimant, 4, { proofDescription: 'proof' }), (error) => error.status === 409);
  }
  const state = fixture();
  const first = await state.service.create(claimant, 4, { proofDescription: 'first' });
  await state.service.approve(owner, first.id);
  await assert.rejects(() => state.service.create(unrelated, 4, { proofDescription: 'second' }), (error) => error.status === 409);
});

test('approving rejects competitors, emits audit records, and rejects unsupported transitions', async () => {
  const state = fixture();
  const first = await state.service.create(claimant, 4, { proofDescription: 'private first evidence' });
  const second = await state.service.create(unrelated, 4, { proofDescription: 'private second evidence' });
  const approved = await state.service.approve(owner, first.id);
  assert.equal(approved.status, 'APPROVED'); assert.equal(state.claims[1].status, 'REJECTED');
  assert.ok(state.claims[1].reviewed_at); assert.equal(state.item.status, 'CLAIMED');
  assert.deepEqual(state.logs.map(({ action }) => action), ['CLAIM_APPROVED', 'CLAIM_REJECTED']);
  assert.equal(JSON.stringify(state.logs).includes('private first evidence'), false);
  await assert.rejects(() => state.service.approve(owner, second.id), (error) => error.status === 409);
  await assert.rejects(() => state.service.reject(owner, first.id), (error) => error.status === 409);
  await assert.rejects(() => state.service.complete(unrelated, first.id), (error) => error.status === 403);
});

test('rejecting last pending Claim reopens item; rejecting one among pending Claims keeps it pending', async () => {
  const state = fixture();
  const a = await state.service.create(claimant, 4, { proofDescription: 'a' });
  const b = await state.service.create(unrelated, 4, { proofDescription: 'b' });
  await state.service.reject(owner, a.id);
  assert.equal(state.item.status, 'CLAIM_PENDING');
  await state.service.reject(owner, b.id);
  assert.equal(state.item.status, 'OPEN');
  await assert.rejects(() => state.service.reject(owner, b.id), (error) => error.status === 409);
});

test('completion requires APPROVED Claim and CLAIMED Item before returning it', async () => {
  const state = fixture();
  const pending = await state.service.create(claimant, 4, { proofDescription: 'proof' });
  await assert.rejects(() => state.service.complete(owner, pending.id), (error) => error.status === 409);
  await state.service.approve(owner, pending.id);
  assert.equal(state.item.status, 'CLAIMED');
  state.item.status = 'CLAIM_PENDING';
  await assert.rejects(() => state.service.complete(owner, pending.id), (error) => error.status === 409);
  assert.equal(state.claims[0].status, 'APPROVED');
  state.item.status = 'CLAIMED';
  const done = await state.service.complete(owner, pending.id);
  assert.equal(done.status, 'COMPLETED'); assert.ok(done.reviewedAt); assert.ok(done.completedAt);
  assert.equal(state.item.status, 'RETURNED');
  await assert.rejects(() => state.service.complete(owner, pending.id), (error) => error.status === 409);
});

test('Claim reads expose evidence only to claimant, owner, or inspection ADMIN; unrelated users are forbidden', async () => {
  const state = fixture();
  const claim = await state.service.create(claimant, 4, { proofDescription: 'private evidence' });
  assert.equal((await state.service.mine(claimant))[0].proofDescription, 'private evidence');
  assert.equal((await state.service.forItem(owner, 4))[0].claimant.fullName, 'Person 20');
  assert.equal((await state.service.forItem({ id: '99', role: 'ADMIN' }, 4)).length, 1);
  await assert.rejects(() => state.service.forItem(unrelated, 4), (error) => error.status === 403);
  await assert.rejects(() => state.service.approve({ id: '99', role: 'ADMIN' }, claim.id), (error) => error.status === 403);
  await assert.rejects(() => state.service.reject(unrelated, claim.id), (error) => error.status === 403);
});

test('HTTP Claim routes require authentication and reject unrecognized client status', async () => {
  const state = fixture();
  const authService = { async authenticate(token) { if (token === 'ok') return claimant; throw Object.assign(new Error('bad token'), { status: 401 }); } };
  const http = await serve({ healthService: { async check() { return {}; } }, authService, userService: {}, itemService: {}, claimService: state.service, logger: () => {} });
  try {
    assert.equal((await fetch(`${http.url}/api/claims/mine`)).status, 401);
    const response = await fetch(`${http.url}/api/items/4/claims`, { method: 'POST', headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' }, body: JSON.stringify({ proofDescription: 'proof', status: 'APPROVED' }) });
    assert.equal(response.status, 400);
    const valid = await fetch(`${http.url}/api/items/4/claims`, { method: 'POST', headers: { Authorization: 'Bearer ok', 'Content-Type': 'application/json' }, body: JSON.stringify({ proofDescription: 'private proof' }) });
    assert.equal(valid.status, 201); assert.equal(valid.headers.get('cache-control'), 'no-store');
    const mine = await fetch(`${http.url}/api/claims/mine`, { headers: { Authorization: 'Bearer ok' } });
    assert.equal(mine.status, 200); assert.equal((await mine.json()).data[0].proofDescription, 'private proof');
  } finally { await http.close(); }
});

test('HTTP ADMIN can claim another owner item, but cannot self-claim or bypass duplicate and state rules', async () => {
  const state = fixture();
  const admin = { id: '99', role: 'ADMIN' };
  const authService = { async authenticate() { return admin; } };
  const http = await serve({ healthService: { async check() { return {}; } }, authService, userService: {}, itemService: {}, claimService: state.service, logger: () => {} });
  const create = () => fetch(`${http.url}/api/items/4/claims`, {
    method: 'POST', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ proofDescription: 'admin private proof' })
  });
  try {
    const made = await create();
    assert.equal(made.status, 201);
    assert.equal((await made.json()).data.claimantId, 99);
    assert.equal((await create()).status, 409);
    state.item.user_id = admin.id;
    assert.equal((await create()).status, 403);
    state.item.user_id = owner.id;
    state.item.status = 'RETURNED';
    assert.equal((await create()).status, 409);
    state.item.status = 'OPEN'; state.item.type = 'LOST';
    assert.equal((await create()).status, 400);
  } finally { await http.close(); }
});
