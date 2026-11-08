import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { readAiVisualConfig } from '../ai-visual/config.js';
import { readAiVisualSuggestionsConfig } from '../config/env.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';

const production = { NODE_ENV: 'production', AI_VISUAL_MODE: 'production', AI_VISUAL_SERVICE_ROLE: 'api',
  DB_HOST: 'mysql.railway.internal', DB_PORT: '3306', DB_NAME: 'findit_db', DB_USER: 'fixture', DB_PASSWORD: 'synthetic-do-not-log',
  AI_VISUAL_MATCHING_CLOUD_NAME: 'fixture-cloud', CLOUDINARY_CLOUD_NAME: 'fixture-cloud' };

test('production requires explicit mode and service role; AI remains opt-in', () => {
  assert.equal(readAiVisualConfig(production).enabled, false);
  assert.equal(readAiVisualSuggestionsConfig(production).enabled, false);
  assert.equal(readAiVisualConfig({ ...production, AI_VISUAL_MATCHING_ENABLED: 'true' }).production, true);
  assert.equal(readAiVisualSuggestionsConfig({ ...production, AI_VISUAL_SUGGESTIONS_ENABLED: 'true' }).enabled, true);
  for (const patch of [{ AI_VISUAL_MODE: undefined }, { AI_VISUAL_MODE: 'typo' }, { AI_VISUAL_SERVICE_ROLE: 'worker' },
    { NODE_ENV: 'development' }, { DB_HOST: undefined }, { DB_PASSWORD: '' }, { DB_PORT: 'invalid' }, { FINDIT_ISOLATED_DATADIR: join(tmpdir(), 'findit-mysql-fake', 'data') }]) {
    assert.throws(() => readAiVisualConfig({ ...production, AI_VISUAL_MATCHING_ENABLED: 'true', ...patch }), error => !error.message.includes(production.DB_PASSWORD));
  }
});

test('production worker uses public cloud name without upload credentials and requires persistent cache path', () => {
  const env = { ...production, AI_VISUAL_SERVICE_ROLE: 'worker', AI_VISUAL_MATCHING_ENABLED: 'true',
    AI_VISUAL_MATCHING_CACHE_DIR: join(tmpdir(), 'fixture-cache'), CLOUDINARY_CLOUD_NAME: undefined };
  assert.equal(readAiVisualConfig(env, 'worker').enabled, true);
  assert.throws(() => readAiVisualConfig(env), /SERVICE_ROLE/);
  assert.throws(() => readAiVisualConfig({ ...env, AI_VISUAL_MATCHING_CACHE_DIR: 'relative' }, 'worker'), /CACHE_DIR/);
  assert.throws(() => readAiVisualConfig({ ...env, AI_VISUAL_MATCHING_CONCURRENCY: '2' }, 'worker'), /CONCURRENCY/);
  assert.throws(() => readAiVisualConfig({ ...env, AI_VISUAL_SUGGESTIONS_ENABLED: 'true' }, 'worker'), /belongs on the API/);
  assert.throws(() => readAiVisualConfig({ ...env, CLOUDINARY_CLOUD_NAME: 'different-cloud' }, 'worker'), /must match/);
  for (const flag of ['AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED', 'AI_VISUAL_NOTIFICATION_SHADOW_MODE', 'AI_VISUAL_NOTIFICATION_DEMO_ENABLED']) {
    assert.throws(() => readAiVisualConfig({ ...env, [flag]: 'true' }, 'worker'), /must be false/);
  }
});

test('API source has no model loader or AI worker startup dependency', async () => {
  const api = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /clip-encoder|ai-visual\/main|createAiVisualWorker|@huggingface/);
});

test('owner state supports processing/failure and rechecks authorization after candidate reads', async () => {
  let eligible = true, state = 'processing';
  const repository = { async isEligibleOwnedLostItem() { return eligible; }, async listForLostItem() { return []; }, async processingState() { return state; } };
  const service = createVisualSuggestionsService(repository, { enabled: true, production: true });
  const identity = { id: '1', role: 'USER' };
  assert.deepEqual(await service.forOwner(identity, 1, { withState: true }), { data: [], visualState: 'processing' });
  state = 'error';
  assert.equal((await service.forOwner(identity, 1, { withState: true })).visualState, 'error');
  repository.listForLostItem = async () => { eligible = false; return []; };
  await assert.rejects(() => service.forOwner(identity, 1), error => error.status === 404);
  eligible = true;
  repository.listForLostItem = async () => { throw Object.assign(new Error("Table 'db.ai_visual_jobs' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' }); };
  await assert.rejects(() => service.forOwner(identity, 1), /doesn't exist/);
  await assert.rejects(() => createVisualSuggestionsService({}, {}).forOwner(identity, 1), error => error.status === 404);
});

test('worker shutdown drains the current job, cleans up and never claims another', async () => {
  const abort = new AbortController();
  let claimed = 0, cleaned = false, finished = false;
  const worker = createAiVisualWorker({ config: { enabled: true, pollMs: 250, maxAttempts: 3 },
    repository: { async claimNext() { claimed++; return { job_id: '1', item_status: 'OPEN', type: 'LOST' }; },
      async saveEmbedding() { return { itemId: '1', type: 'LOST' }; }, async oppositeEmbeddingPage() { return []; },
      async finish() { finished = true; return true; }, async fail() { assert.fail('job must finish'); } },
    imageSource: { async download() { return { filePath: 'synthetic', async cleanup() { cleaned = true; } }; } },
    encoder: { async embedFile() { abort.abort(); return { vector: [1, ...Array(511).fill(0)], inferenceMs: 0 }; } } });
  await worker.run(abort.signal);
  assert.equal(claimed, 1); assert.ok(finished); assert.ok(cleaned);
});
