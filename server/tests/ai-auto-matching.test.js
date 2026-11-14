import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { createJobWatchdog } from '../ai-visual/job-watchdog.js';
import { readAiVisualConfig } from '../ai-visual/config.js';
import { backfillAiVisual } from '../ai-visual/backfill.js';

test('retry after persisting an embedding reuses it without downloading or inference', async () => {
  const vector = Float32Array.from({ length: 512 }, (_, i) => i === 0 ? 1 : 0);
  let saved, matched, completed = false;
  const events = [];
  const worker = createAiVisualWorker({ config: { enabled: true, maxAttempts: 3 },
    repository: {
      async claimNext() { return { job_id: '1', image_id: '2', item_status: 'OPEN', type: 'FOUND' }; },
      async existingEmbedding() { return vector; },
      async saveEmbedding(_job, bytes) { saved = bytes; return { itemId: '3', type: 'FOUND' }; },
      async oppositeEmbeddingPage(_id, type) { assert.equal(type, 'FOUND'); return [{ image_id: '4', item_id: '5', type: 'LOST', embedding_data: saved }]; },
      async upsertCandidates(_job, _id, _type, _model, _revision, candidates) { matched = candidates; return true; },
      async finish() { completed = true; return true; },
      async fail() { assert.fail('reuse must succeed'); }
    },
    encoder: { async embedFile() { assert.fail('cached photo must not run inference'); } },
    imageSource: { async download() { assert.fail('cached photo must not download'); } },
    onEvent: event => events.push(event)
  });
  assert.equal(await worker.processNext(), true);
  assert.ok(completed); assert.equal(saved.length, 2048);
  assert.deepEqual(matched, [{ itemId: '5', type: 'LOST', score: 1 }]);
  assert.equal(events.find(event => event.event === 'job_completed').embeddingReused, true);
  assert.equal(events.at(-1).event, 'job_settled');
});

test('idle queue does not download images or invoke inference', async () => {
  const worker = createAiVisualWorker({ config: { enabled: true },
    repository: { async claimNext() {} },
    encoder: { async embedFile() { assert.fail('idle inference'); } },
    imageSource: { async download() { assert.fail('idle download'); } }
  });
  assert.equal(await worker.processNext(), false);
});

test('watchdog detects a hung job and is cleared after settling or shutdown', async () => {
  const expired = [];
  const watchdog = createJobWatchdog(20, id => expired.push(id));
  try {
    watchdog.observe({ event: 'job_started', jobId: 'hung' });
    await delay(60);
    assert.deepEqual(expired, ['hung']);
    watchdog.observe({ event: 'job_started', jobId: 'settled' });
    watchdog.observe({ event: 'job_settled', jobId: 'settled' });
    await delay(60);
    watchdog.observe({ event: 'job_started', jobId: 'stopped' });
    watchdog.stop();
    await delay(60);
    assert.deepEqual(expired, ['hung']);
  } finally { watchdog.stop(); }
});

test('timeout and explicit backfill scope reject malformed or excessive limits', async () => {
  assert.equal(readAiVisualConfig({}).jobTimeoutMs, 120000);
  for (const value of ['0', '999', '600001', 'NaN', '1.5']) {
    assert.throws(() => readAiVisualConfig({ AI_VISUAL_MATCHING_JOB_TIMEOUT_MS: value }), /JOB_TIMEOUT_MS/);
  }
  for (const itemIds of [[], ['1 OR 1'], ['0'], ['18446744073709551616'], Array(1001).fill('1')]) {
    await assert.rejects(() => backfillAiVisual({}, { itemIds }), /INVALID_BACKFILL_ITEM_IDS/);
  }
});
