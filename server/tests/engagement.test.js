import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateItem, validateUpdateItem } from '../validation/item.validation.js';
import { contactInput, appointmentInput, disputeInput } from '../validation/engagement.validation.js';
import { createEngagementService, viewerKey } from '../services/engagement.service.js';

const base = { title: 'Ví', type: 'FOUND', categoryId: 1, locationId: 1, eventDate: '2026-10-01', description: 'x' };
test('verification questions: FOUND only, max three, trimmed and unique', () => {
  assert.deepEqual(validateCreateItem({ ...base, verificationQuestions: [' Màu? ', 'Bên trong?'] }).verificationQuestions, ['Màu?', 'Bên trong?']);
  assert.equal(validateCreateItem(base).verificationQuestions, undefined);
  for (const bad of [['a', 'b', 'c', 'd'], ['a', 'A'], [''], 'a', ['x'.repeat(201)]]) {
    assert.throws(() => validateCreateItem({ ...base, verificationQuestions: bad }), (error) => error.status === 400);
  }
  assert.throws(() => validateCreateItem({ ...base, type: 'LOST', verificationQuestions: ['a'] }), (error) => error.status === 400);
  assert.deepEqual(validateCreateItem({ ...base, type: 'LOST', verificationQuestions: [] }).verificationQuestions, []);
  assert.deepEqual(validateUpdateItem({ verificationQuestions: [] }), { verificationQuestions: [] });
});
test('contact, appointment and dispute input validation', () => {
  const contact = { fullName: ' An ', email: 'an@uit.edu.vn', topic: 'ITEM', body: ' Chào ' };
  assert.deepEqual(contactInput(contact), { fullName: 'An', email: 'an@uit.edu.vn', topic: 'ITEM', body: 'Chào' });
  for (const bad of [{ ...contact, email: 'x' }, { ...contact, topic: 'SPAM' }, { ...contact, body: ' ' }, { ...contact, extra: 1 }, { ...contact, itemUrl: 'javascript:alert(1)' }]) {
    assert.throws(() => contactInput(bad), (error) => error.status === 400);
  }
  const now = Date.parse('2026-11-01T00:00:00Z');
  assert.equal(appointmentInput({ appointmentAt: '2026-11-02T09:00:00+07:00', place: 'Sảnh A' }, now).place, 'Sảnh A');
  for (const at of ['2026-10-31T00:00:00Z', '2027-03-01T00:00:00Z', 'tomorrow']) {
    assert.throws(() => appointmentInput({ appointmentAt: at, place: 'A' }, now), (error) => error.status === 400);
  }
  assert.throws(() => disputeInput({ reason: '' }), (error) => error.status === 400);
});
test('views skip owners and hidden items; saving own items is rejected; viewer keys are hashed', async () => {
  const recorded = [];
  const repository = {
    async findItem(id) { return { item_id: id, user_id: '1', is_hidden: id === 9 ? 1 : 0 }; },
    async recordView(id, key) { recorded.push([id, key]); return true; },
    async save() {}
  };
  const service = createEngagementService(repository);
  assert.deepEqual(await service.recordView({ id: '1', role: 'USER' }, 3, {}), { counted: false });
  assert.deepEqual(await service.recordView(undefined, 3, { ip: '1.2.3.4', userAgent: 'x' }), { counted: true });
  await assert.rejects(() => service.recordView(undefined, 9, {}), (error) => error.status === 404);
  await assert.rejects(() => service.save({ id: '1', role: 'USER' }, 3), (error) => error.status === 400);
  assert.match(recorded[0][1], /^[0-9a-f]{64}$/);
  assert.notEqual(viewerKey({ id: 1 }), viewerKey(undefined, { ip: '1' }));
  await assert.rejects(() => service.listContacts({ id: '1', role: 'USER' }, { page: 1, limit: 10 }), (error) => error.status === 403);
});
