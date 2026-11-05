// Real MySQL regressions for lifecycle invalidation and in-flight worker writes.
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { quote } from '../../database/schema.js';
import { createDbPool, query } from '../config/db.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createAdminModerationRepository } from '../repositories/admin-moderation.repository.js';
import { createAdminModerationService } from '../services/admin-moderation.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { encodeEmbedding } from '../ai-visual/embeddings.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from '../ai-visual/config.js';

test('shadow candidates stay consistent after terminal transitions and concurrent photo deletion', async (t) => {
  const base = configFromEnv();
  const admin = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let pool;
  try {
    await admin.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await admin.query(`USE ${quote(name)}`);
    await migrate(admin, name);
    await seed(admin, name, {
      USER: { email: 'review@ai.example.test', password: randomBytes(18).toString('hex') },
      ADMIN: { email: 'admin@ai.example.test', password: randomBytes(18).toString('hex') }
    });
    pool = createDbPool({ ...base, database: name });
    const [[owner]] = await query(pool, "SELECT user_id FROM users WHERE email='review@ai.example.test'");
    const [[category]] = await query(pool, 'SELECT category_id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations LIMIT 1');
    const identity = { id: String(owner.user_id), role: 'USER' };
    const [[adminUser]] = await query(pool, "SELECT user_id FROM users WHERE email='admin@ai.example.test'");
    const adminIdentity = { id: String(adminUser.user_id), role: 'ADMIN' };
    const storage = {
      async upload(_buffer, _mime, publicId) { return { url: `https://mock.invalid/${publicId}`, publicId }; },
      async destroy() {}
    };
    const repository = createItemRepository(pool);
    const ai = createAiVisualRepository(pool);
    const operations = createImageOperations(pool, storage, () => {});
    const service = createItemService(repository, storage, operations, { enabled: true });
    const disabledService = createItemService(repository, storage, operations, { enabled: false });
    const claims = createClaimService(createClaimRepository(pool));
    const moderation = createAdminModerationService(createAdminModerationRepository(pool));
    const vector = Float32Array.from([1, ...Array(511).fill(0)]);
    async function fixture(type) {
      const item = await service.create(identity, { title: `Review ${type}`, type,
        categoryId: Number(category.category_id), locationId: Number(location.location_id),
        eventDate: '2026-10-25', description: 'Review fixture', color: null });
      const [photo] = await service.uploadImages(identity, item.id, [{ mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]);
      return { item, photo };
    }
    const lost = await fixture('LOST');
    const found = await fixture('FOUND');
    await query(pool, `INSERT INTO item_image_embeddings
      (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
      VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP())`,
    [found.photo.id, CLIP_MODEL_ID, CLIP_MODEL_REVISION, encodeEmbedding(vector)]);
    const source = { async download() { return { filePath: 'mock', async cleanup() {} }; } };
    const encoder = { async embedFile() { return { vector, inferenceMs: 1 }; } };
    const config = { enabled: true, maxAttempts: 3, pollMs: 250 };
    const worker = createAiVisualWorker({ repository: ai, imageSource: source, encoder, config });
    await worker.processNext();
    await worker.processNext();
    const candidateCount = async () => {
      const [[row]] = await query(pool, 'SELECT COUNT(*) AS n FROM ai_visual_candidates WHERE lost_item_id=? AND found_item_id=?', [lost.item.id, found.item.id]);
      return Number(row.n);
    };
    assert.equal(await candidateCount(), 1);

    await t.test('closing a fully processed item removes its shadow candidates', async () => {
      await service.close(identity, found.item.id);
      assert.equal(await candidateCount(), 0, 'CLOSED item must not retain an active matching candidate');
    });

    // Restore only our disposable fixture to set up the independent race.
    await query(pool, "UPDATE items SET status='OPEN' WHERE item_id=?", [found.item.id]);
    await query(pool, "UPDATE ai_visual_jobs SET status='QUEUED', attempts=0 WHERE image_id=?", [lost.photo.id]);
    await t.test('deleting opposite photo after page read cannot resurrect its candidate', async () => {
      let deleted = false;
      const racingRepository = { ...ai, async oppositeEmbeddingPage(...args) {
        const rows = await ai.oppositeEmbeddingPage(...args);
        if (rows.length && !deleted) {
          deleted = true;
          await service.deleteImage(identity, found.item.id, found.photo.id);
          assert.equal(await candidateCount(), 0, 'deletion itself cleaned the candidate');
        }
        return rows;
      } };
      const racingWorker = createAiVisualWorker({ repository: racingRepository, imageSource: source, encoder, config });
      await racingWorker.processNext();
      assert.equal(deleted, true);
      assert.equal(await candidateCount(), 0, 'worker must not reinsert a score from a photo that was deleted');
    });

    async function pair() {
      const left = await fixture('LOST'), right = await fixture('FOUND');
      while (await worker.processNext()) { /* drain this fixture's jobs */ }
      return { left, right };
    }
    async function count(left, right) {
      const [[row]] = await query(pool, 'SELECT COUNT(*) AS n FROM ai_visual_candidates WHERE lost_item_id=? AND found_item_id=?', [left.item.id, right.item.id]);
      return Number(row.n);
    }
    async function race(left, right, mutation) {
      await query(pool, "UPDATE ai_visual_jobs SET status='QUEUED', attempts=0 WHERE image_id=?", [left.photo.id]);
      let mutated = false;
      const racingRepository = { ...ai, async oppositeEmbeddingPage(...args) {
        const rows = await ai.oppositeEmbeddingPage(...args);
        if (!mutated && rows.some((row) => String(row.item_id) === String(right.item.id))) {
          mutated = true;
          await mutation();
        }
        return rows;
      } };
      await createAiVisualWorker({ repository: racingRepository, imageSource: source, encoder, config }).processNext();
      assert.equal(mutated, true, 'mutation must happen after the target snapshot was read');
    }

    await t.test('closing the opposite item during ranking cannot restore its candidate', async () => {
      const { left, right } = await pair();
      await race(left, right, () => disabledService.close(identity, right.item.id));
      assert.equal(await count(left, right), 0);
    });

    await t.test('closing the worker item during ranking cannot restore its candidate', async () => {
      const { left, right } = await pair();
      await race(left, right, () => service.close(identity, left.item.id));
      assert.equal(await count(left, right), 0);
    });

    await t.test('deleting the best opposite photo recomputes the score from remaining photos while AI is disabled', async () => {
      const { left, right } = await pair();
      const [extra] = await disabledService.uploadImages(identity, right.item.id, [{ mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]);
      await query(pool, `INSERT INTO item_image_embeddings
        (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
        VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP())`,
      [extra.id, CLIP_MODEL_ID, CLIP_MODEL_REVISION, encodeEmbedding([0, 1, ...Array(510).fill(0)])]);
      await race(left, right, () => disabledService.deleteImage(identity, right.item.id, right.photo.id));
      const [[row]] = await query(pool, 'SELECT cosine_score FROM ai_visual_candidates WHERE lost_item_id=? AND found_item_id=?', [left.item.id, right.item.id]);
      assert.equal(Number(row.cosine_score), 0, 'old score 1 must be replaced using the remaining orthogonal vector');
    });

    await t.test('enabled deletion with remaining photos rejects the old page then rebuilds after requeue', async () => {
      const { left, right } = await pair();
      await service.uploadImages(identity, right.item.id, [{ mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]);
      await race(left, right, () => service.deleteImage(identity, right.item.id, right.photo.id));
      assert.equal(await count(left, right), 0, 'deleted embedding generation must not survive invalidation');
      while (await worker.processNext()) { /* remaining photo rebuilds candidates */ }
      assert.equal(await count(left, right), 1);
    });

    await t.test('admin moderation clears candidates and blocks an in-flight opposite worker', async () => {
      const { left, right } = await pair();
      await race(left, right, () => moderation.moderateClose(adminIdentity, right.item.id, { reason: 'Review regression' }));
      assert.equal(await count(left, right), 0);
    });

    await t.test('completing a real Claim clears candidates and blocks an in-flight opposite worker', async () => {
      const { left, right } = await pair();
      const claim = await claims.create(adminIdentity, right.item.id, { proofDescription: 'Review proof' });
      await claims.approve(identity, claim.id);
      await race(left, right, () => claims.complete(identity, claim.id));
      assert.equal(await count(left, right), 0);
      const [[item]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [right.item.id]);
      assert.equal(item.status, 'RETURNED');
    });

    await t.test('terminal workflows still work with no AI tables and the feature disabled', async () => {
      // Prepare before dropping the disposable AI schema. No model or worker runs after this.
      const ownerClose = await fixture('LOST');
      const adminClose = await fixture('FOUND');
      const handover = await fixture('FOUND');
      const claim = await claims.create(adminIdentity, handover.item.id, { proofDescription: 'Review proof' });
      await claims.approve(identity, claim.id);
      await query(pool, 'DROP TABLE ai_visual_candidates, ai_visual_jobs, item_image_embeddings');
      assert.equal((await disabledService.close(identity, ownerClose.item.id)).status, 'CLOSED');
      assert.equal((await moderation.moderateClose(adminIdentity, adminClose.item.id, { reason: 'No AI schema' })).item.status, 'CLOSED');
      assert.equal((await claims.complete(identity, claim.id)).status, 'COMPLETED');
    });
  } finally {
    if (pool) await pool.end();
    try { await admin.query(`DROP DATABASE ${quote(name)}`); }
    finally { await admin.end(); }
  }
});
