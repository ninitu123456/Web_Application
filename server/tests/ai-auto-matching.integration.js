// Production-demo shape from origin/feature/production-demo-items (649794e).
// Fresh local DB only. Storage and model are mocks; transactions/queue/API are real.
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createVisualSuggestionsRepository } from '../repositories/visual-suggestions.repository.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from '../ai-visual/config.js';

test('30 demo posts automatically enqueue after image commit and produce seven expected LOST/FOUND pairs', { timeout: 90000 }, async () => {
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/ai-demo.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.length, 30);
  assert.equal(fixtures.filter(row => row.type === 'LOST').length, 15);
  assert.equal(new Set(fixtures.filter(row => row.pair).map(row => row.pair)).size, 7);
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const admin = await connect(base, false);
  let pool, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await admin.query(`USE \`${name}\``); await migrate(admin, name);
    const password = randomBytes(18).toString('hex');
    await seed(admin, name, { USER: { email: 'demo@ai.test', password }, ADMIN: { email: 'admin@ai.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [[owner]] = await query(pool, 'SELECT user_id FROM users LIMIT 1');
    const [[category]] = await query(pool, 'SELECT category_id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations LIMIT 1');
    const identity = { id: String(owner.user_id), role: 'USER' };
    const repository = createItemRepository(pool), ai = createAiVisualRepository(pool);
    const imageKinds = [...new Set(fixtures.map(row => row.image))], kinds = new Map();
    let uploadingKind, calls = 0;
    const storage = {
      async upload(_bytes, _mime, publicId) { kinds.set(publicId, uploadingKind); return { publicId, url: 'https://fixture.invalid/' + publicId }; },
      async destroy() {}
    };
    const service = createItemService(repository, storage, createImageOperations(pool, storage, () => {}), { enabled: true });
    const photo = { mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };
    const posts = new Map();
    for (const fixture of fixtures) {
      const item = await service.create(identity, { title: 'Synthetic ' + fixture.key, type: fixture.type,
        categoryId: Number(category.category_id), locationId: Number(location.location_id), eventDate: '2026-11-09', description: 'Isolated fixture', color: null });
      uploadingKind = fixture.image;
      const photos = await service.uploadImages(identity, item.id, [photo]);
      posts.set(fixture.key, { ...fixture, id: item.id, imageId: photos[0].id });
      await repository.withLockedItem(item.id, async source => {
        await source.enqueueAiVisualJob(photos[0].id, CLIP_MODEL_ID, CLIP_MODEL_REVISION);
        await source.enqueueAiVisualJob(photos[0].id, CLIP_MODEL_ID, CLIP_MODEL_REVISION);
      });
    }
    const [[queued]] = await query(pool, "SELECT COUNT(*) n FROM ai_visual_jobs WHERE status='QUEUED'");
    assert.equal(Number(queued.n), 30, 'repeated enqueue is idempotent');
    assert.equal(calls, 0, 'publishing must not wait for model');
    const counts = async () => (await query(pool, 'SELECT (SELECT COUNT(*) FROM claims) c,(SELECT COUNT(*) FROM matches) m,(SELECT COUNT(*) FROM notifications) n,(SELECT COUNT(*) FROM email_outbox) e'))[0][0];
    const before = await counts();
    const worker = createAiVisualWorker({ repository: ai, config: { enabled: true, maxAttempts: 3 },
      imageSource: { async download(id) { return { filePath: kinds.get(id), async cleanup() {} }; } },
      encoder: { async embedFile(kind) {
        calls++;
        return { vector: Float32Array.from({ length: 512 }, (_, index) => index === imageKinds.indexOf(kind) ? 1 : 0), inferenceMs: 0 };
      } } });
    for (let i = 0; i < 30; i++) assert.equal(await worker.processNext(), true);
    assert.equal(await worker.processNext(), false); assert.equal(calls, 30);
    const suggestions = createVisualSuggestionsService(createVisualSuggestionsRepository(pool), { enabled: true });
    for (const lost of [...posts.values()].filter(row => row.type === 'LOST' && row.pair)) {
      const found = [...posts.values()].find(row => row.type === 'FOUND' && row.pair === lost.pair);
      const result = await suggestions.forOwner(identity, lost.id, { withState: true });
      assert.equal(result.visualState, 'ready');
      assert.ok(result.data.some(row => row.itemId === found.id), lost.key);
    }
    const [[invalid]] = await query(pool, `SELECT COUNT(*) n FROM ai_visual_candidates c
      JOIN items l ON l.item_id=c.lost_item_id JOIN items f ON f.item_id=c.found_item_id WHERE l.type<>'LOST' OR f.type<>'FOUND'`);
    assert.equal(Number(invalid.n), 0);
    const first = posts.get('phone-01');
    uploadingKind = first.image;
    const [extra] = await service.uploadImages(identity, first.id, [photo]);
    await worker.processNext(); assert.equal(calls, 31);
    await service.deleteImage(identity, first.id, first.imageId);
    const [[retained]] = await query(pool, 'SELECT COUNT(*) n FROM item_image_embeddings WHERE image_id=?', [extra.id]);
    assert.equal(Number(retained.n), 1, 'removing a photo retains unchanged vectors');
    await worker.processNext(); assert.equal(calls, 31, 'rebuild pairs without rerunning inference');
    assert.equal((await suggestions.forOwner(identity, first.id, { withState: true })).visualState, 'ready');
    await assert.rejects(() => repository.withLockedItem(first.id, async source => {
      const image = await source.addImage(first.id, 'https://fixture.invalid/rollback', 'findit/items/123e4567-e89b-42d3-a456-426614174000');
      await source.enqueueAiVisualJob(image.image_id, CLIP_MODEL_ID, CLIP_MODEL_REVISION);
      assert.equal(await worker.processNext(), false, 'uncommitted queue row must not be claimed');
      throw new Error('fixture rollback');
    }), /fixture rollback/);
    assert.equal(await worker.processNext(), false, 'rollback leaves no job');
    assert.deepEqual(await counts(), before, 'AI never changes Claims, official matches or delivery queues');
  } finally {
    await pool?.end();
    try { if (created) await admin.query(`DROP DATABASE \`${name}\``); } finally { await admin.end(); }
  }
});
