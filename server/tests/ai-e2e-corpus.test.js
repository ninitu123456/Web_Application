import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { retrievalMetrics, readAiCorpus } from '../scripts/ai-e2e-corpus.js';

test('retrieval evaluation uses physical object relevance, macro averages and explicit missing relevance', () => {
  const items = [{ id: 'q-a', objectId: 'a', type: 'LOST' }, { id: 'q-b', objectId: 'b', type: 'LOST' },
    { id: 'q-missing', objectId: 'missing', type: 'LOST' }, { id: 'g-a', objectId: 'a', type: 'FOUND' }, { id: 'g-b', objectId: 'b', type: 'FOUND' }];
  const ranking = [{ id: 'g-b', cosineScore: 0.9 }, { id: 'g-a', cosineScore: 0.8 }];
  const result = retrievalMetrics(items, { 'q-a': ranking, 'q-b': ranking, 'q-missing': ranking });
  assert.equal(result.atK[1].recall, 0.5); assert.equal(result.atK[1].precision, 1 / 3);
  assert.equal(result.atK[3].recall, 1); assert.equal(result.atK[3].precision, 2 / 9);
  assert.equal(result.queriesWithoutRelevantGallery, 1); assert.equal(result.queries[2].atK[3].recall, null);
  assert.throws(() => retrievalMetrics(items, { 'q-a': [ranking[0], ranking[0]] }), /duplicate/);
  assert.throws(() => retrievalMetrics(items, { 'q-a': [{ id: 'unknown', cosineScore: 1 }] }), /Invalid/);
});

test('corpus separates query views, groups gallery views and refuses non-image content', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'findit-ai-corpus-'));
  try {
    for (const kind of ['queries', 'gallery']) {
      await mkdir(resolve(root, kind, 'bag-a'), { recursive: true });
      for (const name of ['front.png', 'side.png']) await writeFile(resolve(root, kind, 'bag-a', name), Buffer.from('placeholder; decoder is tested separately'));
    }
    const items = await readAiCorpus(root);
    assert.equal(items.filter(item => item.type === 'LOST').length, 2);
    assert.equal(items.filter(item => item.type === 'FOUND').length, 1);
    assert.equal(items.at(-1).images.length, 2);
    await writeFile(resolve(root, 'queries', 'bag-a', 'secret.txt'), 'must not be read');
    await assert.rejects(() => readAiCorpus(root), /JPEG, PNG and WebP/);
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.ok(basename(root).startsWith('findit-ai-corpus-'));
    await rm(root, { recursive: true, force: true });
  }
});
