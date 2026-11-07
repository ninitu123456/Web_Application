import test from 'node:test';
import assert from 'node:assert/strict';
import { join, posix, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createVisualSuggestionsRepository, isMissingAiVisualTable } from '../repositories/visual-suggestions.repository.js';
import { readAiVisualSuggestionsConfig, readConfig } from '../config/env.js';
import { serve } from './helpers.js';

const owner = { id: '12', role: 'USER' };
const publicRow = {
  item_id: '41', title: 'Found blue pouch', description: 'Near the library', color: 'Blue',
  event_date: new Date('2026-11-01T00:00:00Z'), category_name: 'Personal items',
  location_name: 'Library', thumbnail_url: 'https://res.cloudinary.com/demo/image/upload/test.jpg', cosine_score: 0.734
};

test('visual suggestion exposure defaults off and enabling requires a disposable local development database', () => {
  assert.deepEqual(readAiVisualSuggestionsConfig({}), { enabled: false });
  assert.equal(readConfig({ DB_USER: 'test', DB_PASSWORD: '', JWT_SECRET: 'x'.repeat(32), NODE_ENV: 'development' }).aiVisualSuggestions.enabled, false);
  assert.throws(() => readAiVisualSuggestionsConfig({ AI_VISUAL_SUGGESTIONS_ENABLED: 'yes' }), /must be true or false/);
  assert.throws(() => readAiVisualSuggestionsConfig({ AI_VISUAL_SUGGESTIONS_ENABLED: 'true', NODE_ENV: 'production', DB_HOST: '127.0.0.1', DB_PORT: '62123' }), /development\/test/);
  assert.throws(() => readAiVisualSuggestionsConfig({ AI_VISUAL_SUGGESTIONS_ENABLED: 'true', NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '3306', FINDIT_ISOLATED_DATADIR: 'C:\\Temp\\findit-mysql-test\\data' }), /isolated local MySQL/);
  const safe = readAiVisualSuggestionsConfig({ AI_VISUAL_SUGGESTIONS_ENABLED: 'true', NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '62123', FINDIT_ISOLATED_DATADIR: join(tmpdir(), 'findit-mysql-test', 'data') });
  assert.deepEqual(safe, { enabled: true });
});

test('isolated suggestion fixture paths pass the actual guard on both Ubuntu and Windows', () => {
  for (const [paths, temporary] of [[posix, '/tmp'], [win32, 'C:\\Temp']]) {
    // Evaluate the real pure validator with each platform's path semantics.
    // This reproduces the old Windows-only fixture failure on a Windows host too.
    const validate = runInNewContext(`(${readAiVisualSuggestionsConfig.toString()})`, {
      resolve: paths.resolve, relative: paths.relative, sep: paths.sep, tmpdir: () => temporary
    });
    const input = { AI_VISUAL_SUGGESTIONS_ENABLED: 'true', NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '62123' };
    assert.equal(validate({ ...input, FINDIT_ISOLATED_DATADIR: paths.join(temporary, 'findit-mysql-test', 'data') }).enabled, true);
    if (paths === posix) assert.throws(() => validate({ ...input, FINDIT_ISOLATED_DATADIR: 'C:\\Temp\\findit-mysql-test\\data' }), /isolated local MySQL/);
  }
});

test('service hides private/non-owned and ineligible source items and never returns internal fields', async () => {
  const calls = [];
  const repository = {
    async isEligibleOwnedLostItem(id, ownerId) { calls.push([id, ownerId]); return id === 9 && ownerId === '12'; },
    async listForLostItem(id, limit) { assert.equal(id, 9); assert.equal(limit, 3); return [publicRow]; }
  };
  const service = createVisualSuggestionsService(repository, { enabled: true });
  await assert.rejects(() => service.forOwner({ id: '13', role: 'USER' }, 9), (error) => error.status === 404);
  await assert.rejects(() => service.forOwner(owner, 10), (error) => error.status === 404);
  assert.equal(calls.length, 2);
  const result = await service.forOwner(owner, 9);
  assert.deepEqual(result, [{ itemId: 41, title: publicRow.title, description: publicRow.description, color: 'Blue', eventDate: '2026-11-01', category: 'Personal items', location: 'Library', thumbnailUrl: publicRow.thumbnail_url, cosineScore: 0.734 }]);
  for (const forbidden of ['embedding', 'private_identifiers', 'user_id', 'email', 'proofDescription', 'lease_token', 'last_error_code']) assert.equal(JSON.stringify(result).includes(forbidden), false);
});

test('service returns an empty safe fallback when AI tables are missing and propagates unrelated database errors', async () => {
  const eligible = { async isEligibleOwnedLostItem() { return true; }, async listForLostItem() { throw Object.assign(new Error("Table 'findit_db.ai_visual_candidates' doesn't exist"), { code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'findit_db.ai_visual_candidates' doesn't exist" }); } };
  assert.deepEqual(await createVisualSuggestionsService(eligible, { enabled: true }).forOwner(owner, 9), []);
  assert.equal(isMissingAiVisualTable({ code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'db.ai_visual_candidates' doesn't exist" }), true);
  assert.equal(isMissingAiVisualTable({ code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'db.ai_visual_candidates_backup' doesn't exist" }), false);
  assert.equal(isMissingAiVisualTable({ code: 'ER_NO_SUCH_TABLE', sqlMessage: "Table 'db.items' doesn't exist" }), false);
  const broken = { async isEligibleOwnedLostItem() { throw Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }); } };
  await assert.rejects(() => createVisualSuggestionsService(broken, { enabled: true }).forOwner(owner, 9), /connection lost/);
});

test('endpoint always requires JWT, hides disabled feature and returns only owner-scoped bounded suggestions', async () => {
  const service = createVisualSuggestionsService({
    async isEligibleOwnedLostItem(id, userId) { return id === 9 && userId === '12'; },
    async listForLostItem() { return [publicRow]; }
  }, { enabled: true });
  const authService = { async authenticate(token) { if (token !== 'valid') throw Object.assign(new Error('bad token'), { status: 401 }); return owner; } };
  const http = await serve({ healthService: { async check() { return {}; } }, authService, userService: {}, itemService: {}, visualSuggestionsService: service });
  try {
    const path = `${http.url}/api/items/9/visual-suggestions`;
    assert.equal((await fetch(path)).status, 401);
    const response = await fetch(path, { headers: { Authorization: 'Bearer valid' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await response.json()).data[0], { itemId: 41, title: publicRow.title, description: publicRow.description, color: 'Blue', eventDate: '2026-11-01', category: 'Personal items', location: 'Library', thumbnailUrl: publicRow.thumbnail_url, cosineScore: 0.734 });
    const invalid = await fetch(`${http.url}/api/items/not-an-id/visual-suggestions`, { headers: { Authorization: 'Bearer valid' } });
    assert.equal(invalid.status, 400);
  } finally { await http.close(); }

  const disabledHttp = await serve({ healthService: { async check() { return {}; } }, authService, userService: {}, itemService: {}, visualSuggestionsService: createVisualSuggestionsService({}, { enabled: false }) });
  try {
    const path = `${disabledHttp.url}/api/items/9/visual-suggestions`;
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { headers: { Authorization: 'Bearer valid' } })).status, 404);
  } finally { await disabledHttp.close(); }
});

test('repository uses bound parameters, pinned model, current embeddings, stable ordering and a hard limit', async () => {
  const calls = [];
  const repository = createVisualSuggestionsRepository({}, async (sql, values) => { calls.push({ sql, values }); return [[publicRow], []]; });
  await repository.isEligibleOwnedLostItem(9, '12');
  await repository.listForLostItem(9, 3);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].values, [9, '12']);
  assert.doesNotMatch(calls[1].sql, /private_identifiers|embedding_data|proof_description|email|lease_token|last_error_code/i);
  assert.match(calls[1].sql, /ORDER BY candidate\.cosine_score DESC, candidate\.found_item_id ASC LIMIT \?/);
  assert.match(calls[1].sql, /NOT EXISTS/);
  assert.equal(calls[1].values.at(-1), 3);
  await assert.rejects(() => repository.listForLostItem(9, 4), /between 1 and 3/);
});
