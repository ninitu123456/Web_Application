import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { quote } from '../../database/schema.js';
import { createDbPool, query } from '../config/db.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { encodeEmbedding } from '../ai-visual/embeddings.js';
import { createVisualSuggestionsRepository } from '../repositories/visual-suggestions.repository.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createItemService } from '../services/item.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { createAiVisualSnapshotService } from '../ai-visual/snapshot-service.js';

test('AI Visual Matching jobs and shadow candidates use only the isolated MySQL instance', { timeout: 120000 }, async (t) => {
  assert.ok(process.env.FINDIT_ISOLATED_DATADIR, 'Use npm run test:integration:isolated; refusing the installed database');
  const base = configFromEnv();
  const admin = await connect(base, false);
  const name = `findit_test_${randomBytes(12).toString('hex')}`;
  let created = false, pool;
  try {
    const [[instance]] = await admin.query('SELECT @@datadir AS directory, @@port AS port');
    assert.equal(resolve(instance.directory), resolve(process.env.FINDIT_ISOLATED_DATADIR));
    assert.equal(Number(instance.port), base.port);
    await admin.query(`CREATE DATABASE ${quote(name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await admin.query(`USE ${quote(name)}`);
    await migrate(admin, name);
    const password = randomBytes(18).toString('hex');
    await seed(admin, name, { USER: { email: 'user@ai-visual.example.test', password }, ADMIN: { email: 'admin@ai-visual.example.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [[owner]] = await query(pool, "SELECT user_id FROM users WHERE email='user@ai-visual.example.test'");
    const [[category]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
    const identity = { id: String(owner.user_id), role: 'USER' };
    const assets = new Map();
    const storage = {
      async upload(_buffer, _mimetype, publicId) { assets.set(publicId, true); return { url: `https://mock.invalid/${publicId}`, publicId }; },
      async destroy(publicId) { assets.delete(publicId); }
    };
    const itemRepository = createItemRepository(pool);
    const aiRepository = createAiVisualRepository(pool);
    const operations = createImageOperations(pool, storage, () => {});
    const service = createItemService(itemRepository, storage, operations, { enabled: true });
    const item = (type, title) => service.create(identity, { title, type, categoryId: Number(category.category_id), locationId: Number(location.location_id), eventDate: '2026-10-25', description: `AI fixture ${title}`, color: null });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const lost = await item('LOST', 'AI fixture lost object');

    await t.test('transaction-invalidating enqueue error rolls back image row and compensates Cloudinary upload', async () => {
      const victim = await item('FOUND', 'AI enqueue deadlock fixture');
      const deadlockPool = {
        async getConnection() {
          const connection = await pool.getConnection();
          return new Proxy(connection, { get(target, key) {
            if (key === 'query') return (statement, values) => {
              const sql = typeof statement === 'string' ? statement : statement.sql;
              if (sql.startsWith('INSERT IGNORE INTO ai_visual_jobs')) throw Object.assign(new Error('simulated deadlock'), { code: 'ER_LOCK_DEADLOCK' });
              return target.query(statement, values);
            };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
          } });
        }
      };
      const deadlockRepository = createItemRepository(deadlockPool);
      const deadlockOperations = createImageOperations(deadlockPool, storage, () => {});
      const deadlockService = createItemService(deadlockRepository, storage, deadlockOperations, { enabled: true });
      const beforeAssets = assets.size;
      await assert.rejects(() => deadlockService.uploadImages(identity, victim.id, [{ mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }]),
        (error) => error.code === 'ER_LOCK_DEADLOCK');
      const [[rows]] = await query(pool, 'SELECT COUNT(*) AS total FROM item_images WHERE item_id=?', [victim.id]);
      assert.equal(Number(rows.total), 0);
      assert.equal(assets.size, beforeAssets, 'compensation removes the just-uploaded Cloudinary asset');
    });
    const lostImages = await service.uploadImages(identity, lost.id, [{ mimetype: 'image/png', buffer: png }, { mimetype: 'image/png', buffer: png }]);
    const found = await item('FOUND', 'AI fixture found object');
    const foundImages = await itemRepository.withLockedItem(found.id, async (source) => {
      const images = [];
      images.push(await source.addImage(found.id, 'https://mock.invalid/found-1', 'findit/items/123e4567-e89b-42d3-a456-426614174000'));
      images.push(await source.addImage(found.id, 'https://mock.invalid/found-2', 'findit/items/123e4567-e89b-42d3-a456-426614174001'));
      return images;
    });
    const modelId = 'Xenova/clip-vit-base-patch32', revision = '4c1807b705b1d015fb032789cc4d221b23025a6f';
    const direction = encodeEmbedding([1, ...Array(511).fill(0)]);
    const orthogonal = encodeEmbedding([0, 1, ...Array(510).fill(0)]);
    await query(pool, `INSERT INTO item_image_embeddings (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
      VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP()), (?, ?, ?, 512, ?, UTC_TIMESTAMP())`,
    [foundImages[0].image_id, modelId, revision, orthogonal, foundImages[1].image_id, modelId, revision, direction]);

    const counts = async () => {
      const [[row]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM matches) AS matches, (SELECT COUNT(*) FROM notifications) AS notifications, (SELECT COUNT(*) FROM claims) AS claims');
      return Object.values(row).map(Number);
    };
    const beforeAi = await counts();
    const fetches = [];
    const worker = createAiVisualWorker({ repository: aiRepository, config: { enabled: true, maxAttempts: 3, pollMs: 250 },
      imageSource: { async download(id) { fetches.push(id); return { filePath: 'local-test-fixture.png', async cleanup() {} }; } },
      encoder: { async embedFile() { return { vector: Float32Array.from([1, ...Array(511).fill(0)]), inferenceMs: 1 }; } }
    });
    assert.equal(await worker.processNext(), true);
    const [[candidate]] = await query(pool, 'SELECT lost_item_id, found_item_id, cosine_score FROM ai_visual_candidates WHERE lost_item_id=? AND found_item_id=?', [lost.id, found.id]);
    assert.equal(String(candidate.lost_item_id), String(lost.id));
    assert.equal(String(candidate.found_item_id), String(found.id));
    assert.equal(Number(candidate.cosine_score), 1);
    assert.equal(fetches.length, 1);
    assert.deepEqual(await counts(), beforeAi, 'shadow matching must not mutate official matches, notifications, or Claims');
    const [[dedup]] = await query(pool, 'SELECT COUNT(*) AS total FROM ai_visual_jobs WHERE image_id=?', [lostImages[0].id]);
    assert.equal(Number(dedup.total), 1);

    // A job that was PROCESSING when its worker stopped is reclaimed after its lease expires.
    const expiredLease = await aiRepository.claimNext(3);
    assert.ok(expiredLease);
    await query(pool, 'UPDATE ai_visual_jobs SET locked_until=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE job_id=?', [expiredLease.job_id]);
    let job = await aiRepository.claimNext(3);
    assert.ok(job);
    assert.notEqual(job.lease_token, expiredLease.lease_token);
    assert.equal(Number(job.attempts), 2);
    assert.equal(await aiRepository.saveEmbedding(expiredLease, direction), undefined, 'stale lease cannot save an embedding');
    assert.equal(await aiRepository.upsertCandidates(expiredLease, lost.id, 'LOST', modelId, revision, [{ itemId: found.id, score: 0.99 }]), false,
      'stale lease cannot write candidates');
    await aiRepository.fail(expiredLease, new Error('stale worker'), 3);
    const [[stillOwned]] = await query(pool, 'SELECT status, lease_token FROM ai_visual_jobs WHERE job_id=?', [job.job_id]);
    assert.equal(stillOwned.status, 'PROCESSING');
    assert.equal(stillOwned.lease_token, job.lease_token);
    assert.equal(await aiRepository.renewLease(expiredLease), false);
    assert.equal(await aiRepository.renewLease(job), true);
    await aiRepository.fail(job, new Error('AI_VISUAL_TEST_FAILURE'), 3);
    await query(pool, 'UPDATE ai_visual_jobs SET available_at=UTC_TIMESTAMP() WHERE job_id=?', [job.job_id]);
    job = await aiRepository.claimNext(3);
    assert.equal(Number(job.attempts), 3);
    await aiRepository.fail(job, new Error('AI_VISUAL_TEST_FAILURE'), 3);
    const [[failed]] = await query(pool, 'SELECT status, attempts FROM ai_visual_jobs WHERE job_id=?', [job.job_id]);
    assert.equal(failed.status, 'FAILED');

    // Deleting one photo invalidates the item's old max-pair scores and queues its remaining photo again.
    await service.deleteImage(identity, lost.id, lostImages[0].id);
    const [[staleCandidate]] = await query(pool, 'SELECT COUNT(*) AS total FROM ai_visual_candidates WHERE lost_item_id=? OR found_item_id=?', [lost.id, lost.id]);
    assert.equal(Number(staleCandidate.total), 0);
    const [[remainingJob]] = await query(pool, "SELECT status FROM ai_visual_jobs WHERE image_id=? AND model_id=? AND model_revision=?", [lostImages[1].id, modelId, revision]);
    assert.equal(remainingJob.status, 'QUEUED');
    await query(pool, "UPDATE ai_visual_jobs SET status='CANCELLED' WHERE image_id=?", [lostImages[1].id]);

    await t.test('disabling AI still removes stale rows before deleting an image', async () => {
      const disabledFixture = await item('LOST', 'AI disabled cleanup fixture');
      const [photo] = await service.uploadImages(identity, disabledFixture.id, [{ mimetype: 'image/png', buffer: png }]);
      await query(pool, `INSERT INTO item_image_embeddings (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
        VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP())`, [photo.id, modelId, revision, direction]);
      await query(pool, `INSERT INTO ai_visual_candidates (lost_item_id, found_item_id, model_id, model_revision, cosine_score, updated_at)
        VALUES (?, ?, ?, ?, 0.9, UTC_TIMESTAMP())`, [disabledFixture.id, found.id, modelId, revision]);
      const disabledService = createItemService(itemRepository, storage, operations, { enabled: false });
      await disabledService.deleteImage(identity, disabledFixture.id, photo.id);
      const [[remaining]] = await query(pool, `SELECT
        (SELECT COUNT(*) FROM item_images WHERE image_id=?) AS image_count,
        (SELECT COUNT(*) FROM ai_visual_jobs WHERE image_id=?) AS job_count,
        (SELECT COUNT(*) FROM item_image_embeddings WHERE image_id=?) AS embedding_count,
        (SELECT COUNT(*) FROM ai_visual_candidates WHERE lost_item_id=? OR found_item_id=?) AS candidate_count`,
      [photo.id, photo.id, photo.id, disabledFixture.id, disabledFixture.id]);
      assert.deepEqual(Object.values(remaining).map(Number), [0, 0, 0, 0]);
    });

    await t.test('fatal requeue failure rolls back image deletion and preserves AI rows and mock cloud assets', async () => {
      const fixture = await item('FOUND', 'AI delete requeue failure fixture');
      const photos = await service.uploadImages(identity, fixture.id, [0, 1].map(() => ({ mimetype: 'image/png', buffer: png })));
      await query(pool, `INSERT INTO item_image_embeddings (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
        VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP())`, [photos[0].id, modelId, revision, direction]);
      await query(pool, `INSERT INTO ai_visual_candidates (lost_item_id, found_item_id, model_id, model_revision, cosine_score, updated_at)
        VALUES (?, ?, ?, ?, 0.6, UTC_TIMESTAMP())`, [lost.id, fixture.id, modelId, revision]);
      const deadlock = Object.assign(new Error('simulated requeue deadlock'), { code: 'ER_LOCK_DEADLOCK' });
      const failingRepository = { ...itemRepository, withLockedItem(id, operation, options) {
        return itemRepository.withLockedItem(id, (source) => operation({ ...source, async enqueueAiVisualJob() { throw deadlock; } }), options);
      } };
      const failingService = createItemService(failingRepository, storage, operations, { enabled: true });
      const beforeAssets = new Map(assets);
      await assert.rejects(() => failingService.deleteImage(identity, fixture.id, photos[0].id), (error) => error === deadlock);
      const [[remaining]] = await query(pool, `SELECT
        (SELECT COUNT(*) FROM item_images WHERE item_id=?) AS image_count,
        (SELECT COUNT(*) FROM ai_visual_jobs WHERE image_id IN (?, ?)) AS job_count,
        (SELECT COUNT(*) FROM item_image_embeddings WHERE image_id=?) AS embedding_count,
        (SELECT COUNT(*) FROM ai_visual_candidates WHERE found_item_id=?) AS candidate_count`,
      [fixture.id, photos[0].id, photos[1].id, photos[0].id, fixture.id]);
      assert.deepEqual(Object.values(remaining).map(Number), [2, 2, 1, 1]);
      assert.deepEqual(assets, beforeAssets);
      const disabledService = createItemService(itemRepository, storage, operations, { enabled: false });
      for (const photo of photos) await disabledService.deleteImage(identity, fixture.id, photo.id);
    });

    await t.test('inactive items cancel queued work without downloading their image', async () => {
      const closed = await item('LOST', 'AI fixture closed object');
      const [image] = await service.uploadImages(identity, closed.id, [{ mimetype: 'image/png', buffer: png }]);
      await service.close(identity, closed.id);
      const beforeFetches = fetches.length;
      assert.equal(await worker.processNext(), true);
      assert.equal(fetches.length, beforeFetches);
      const [[row]] = await query(pool, 'SELECT status FROM ai_visual_jobs WHERE image_id=?', [image.id]);
      assert.equal(row.status, 'CANCELLED');
    });

    await t.test('worker retries a transient database polling failure', async () => {
      const controller = new AbortController();
      let claims = 0;
      const events = [];
      const pollingWorker = createAiVisualWorker({
        repository: { ...aiRepository, async claimNext() {
          if (++claims === 1) throw Object.assign(new Error('temporary database error'), { code: 'ECONNRESET' });
          controller.abort();
          return undefined;
        } },
        config: { enabled: true, maxAttempts: 3, pollMs: 250 },
        imageSource: { async download() { assert.fail('poll recovery must not fetch an image'); } },
        encoder: { async embedFile() { assert.fail('poll recovery must not run inference'); } },
        onEvent(event) { events.push(event); }
      });
      await pollingWorker.run(controller.signal);
      assert.equal(claims, 2);
      assert.equal(events[0].event, 'worker_poll_failed');
      assert.equal(events[0].code, 'ECONNRESET');
    });

    await t.test('worker renews its lease while inference is running', async () => {
      const heartbeatItem = await item('LOST', 'AI lease heartbeat fixture');
      const [photo] = await service.uploadImages(identity, heartbeatItem.id, [{ mimetype: 'image/png', buffer: png }]);
      let renewals = 0;
      const heartbeatRepository = { ...aiRepository, async renewLease(job) { renewals++; return aiRepository.renewLease(job); } };
      const heartbeatWorker = createAiVisualWorker({
        repository: heartbeatRepository,
        config: { enabled: true, maxAttempts: 3, pollMs: 250, leaseRenewMs: 10 },
        imageSource: { async download() { return { filePath: 'local-heartbeat.png', async cleanup() {} }; } },
        encoder: { async embedFile() { await new Promise((resolve) => setTimeout(resolve, 40)); return { vector: Float32Array.from([1, ...Array(511).fill(0)]), inferenceMs: 40 }; } }
      });
      assert.equal(await heartbeatWorker.processNext(), true);
      assert.ok(renewals >= 1);
      const [[row]] = await query(pool, 'SELECT status, lease_token FROM ai_visual_jobs WHERE image_id=?', [photo.id]);
      assert.equal(row.status, 'COMPLETED');
      assert.equal(row.lease_token, null);
    });

    await t.test('candidate written before failed completion remains visible during retry and terminal job states', async () => {
      const partialLost = await item('LOST', 'AI partial result visibility fixture');
      const partialFound = await item('FOUND', 'AI partial result target fixture');
      const [lostPhoto] = await service.uploadImages(identity, partialLost.id, [{ mimetype: 'image/png', buffer: png }]);
      const [foundPhoto] = await service.uploadImages(identity, partialFound.id, [{ mimetype: 'image/png', buffer: png }]);
      await query(pool, `INSERT INTO item_image_embeddings (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
        VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP())`, [foundPhoto.id, 'Xenova/clip-vit-base-patch32', '4c1807b705b1d015fb032789cc4d221b23025a6f', direction]);
      const interruptedRepository = { ...aiRepository, async finish() { throw new Error('injected interruption before job completion'); } };
      const interruptedWorker = createAiVisualWorker({ repository: interruptedRepository, config: { enabled: true, maxAttempts: 3, pollMs: 250 },
        imageSource: { async download() { return { filePath: 'local-interruption.png', async cleanup() {} }; } },
        encoder: { async embedFile() { return { vector: Float32Array.from([1, ...Array(511).fill(0)]), inferenceMs: 1 }; } }
      });
      await interruptedWorker.processNext();

      const [[job]] = await query(pool, 'SELECT job_id, status, attempts, lease_token FROM ai_visual_jobs WHERE image_id=?', [lostPhoto.id]);
      assert.equal(job.status, 'QUEUED');
      assert.equal(Number(job.attempts), 1);
      assert.equal(job.lease_token, null);
      const [[persisted]] = await query(pool, `SELECT COUNT(*) AS embeddings, MIN(OCTET_LENGTH(embedding_data)) AS min_bytes,
        MAX(OCTET_LENGTH(embedding_data)) AS max_bytes FROM item_image_embeddings WHERE image_id=?`, [lostPhoto.id]);
      assert.deepEqual(Object.values(persisted).map(Number), [1, 2048, 2048]);
      const [[candidateCount]] = await query(pool, 'SELECT COUNT(*) AS count FROM ai_visual_candidates WHERE lost_item_id=? AND found_item_id=?', [partialLost.id, partialFound.id]);
      assert.equal(Number(candidateCount.count), 1);

      const suggestions = createVisualSuggestionsService(createVisualSuggestionsRepository(pool), { enabled: true });
      const visible = await suggestions.forOwner(identity, partialLost.id);
      assert.ok(visible.some((candidate) => candidate.itemId === Number(partialFound.id)), 'candidate is visible while retry is pending');

      for (const status of ['PROCESSING', 'FAILED', 'COMPLETED']) {
        await query(pool, 'UPDATE ai_visual_jobs SET status=?, lease_token=NULL, locked_until=NULL WHERE job_id=?', [status, job.job_id]);
        assert.ok((await suggestions.forOwner(identity, partialLost.id)).some((candidate) => candidate.itemId === Number(partialFound.id)), `candidate remains visible for ${status}`);
      }

      await query(pool, "UPDATE ai_visual_jobs SET status='QUEUED', available_at=UTC_TIMESTAMP() WHERE job_id=?", [job.job_id]);
      assert.equal(await worker.processNext(), true);
      const [[completed]] = await query(pool, 'SELECT status, attempts, lease_token FROM ai_visual_jobs WHERE job_id=?', [job.job_id]);
      assert.equal(completed.status, 'COMPLETED');
      assert.equal(Number(completed.attempts), 2);
      assert.equal(completed.lease_token, null);
      const [[deduplicated]] = await query(pool, `SELECT COUNT(*) AS embeddings FROM item_image_embeddings
        WHERE image_id=? AND model_id='Xenova/clip-vit-base-patch32' AND model_revision='4c1807b705b1d015fb032789cc4d221b23025a6f'`, [lostPhoto.id]);
      assert.equal(Number(deduplicated.embeddings), 1);
      assert.ok((await suggestions.forOwner(identity, partialLost.id)).some((candidate) => candidate.itemId === Number(partialFound.id)));
    });

    await t.test('retrieval, pre-persistence, post-persistence, and heartbeat failures leave retryable consistent rows', async () => {
      for (const stage of ['retrieval', 'persistence', 'candidate_page', 'heartbeat']) {
        const fixture = await item('LOST', `AI ${stage} interruption fixture`);
        const [photo] = await service.uploadImages(identity, fixture.id, [{ mimetype: 'image/png', buffer: png }]);
        await query(pool, "UPDATE ai_visual_jobs SET status='CANCELLED', locked_until=NULL, lease_token=NULL WHERE status='QUEUED' AND image_id<>?", [photo.id]);
        const faultRepository = { ...aiRepository };
        if (stage === 'persistence') faultRepository.saveEmbedding = async () => { throw new Error('injected before embedding persistence'); };
        if (stage === 'candidate_page') faultRepository.oppositeEmbeddingPage = async () => { throw new Error('injected after embedding persistence'); };
        if (stage === 'heartbeat') faultRepository.renewLease = async () => false;
        const faultWorker = createAiVisualWorker({ repository: faultRepository,
          config: { enabled: true, maxAttempts: 3, pollMs: 250, ...(stage === 'heartbeat' ? { leaseRenewMs: 1 } : {}) },
          imageSource: { async download() {
            if (stage === 'retrieval') throw new Error('injected retrieval interruption');
            return { filePath: `local-${stage}.png`, async cleanup() {} };
          } },
          encoder: { async embedFile() {
            if (stage === 'heartbeat') await new Promise((resolve) => setTimeout(resolve, 15));
            return { vector: Float32Array.from([1, ...Array(511).fill(0)]), inferenceMs: 1 };
          } }
        });
        await faultWorker.processNext();
        const [[job]] = await query(pool, 'SELECT status, attempts, lease_token FROM ai_visual_jobs WHERE image_id=?', [photo.id]);
        assert.equal(job.status, 'QUEUED', `${stage}: failed attempt stays retryable`);
        assert.equal(Number(job.attempts), 1);
        assert.equal(job.lease_token, null);
        const [[counts]] = await query(pool, `SELECT
          (SELECT COUNT(*) FROM item_image_embeddings WHERE image_id=?) AS embeddings,
          (SELECT COUNT(*) FROM ai_visual_candidates WHERE lost_item_id=? OR found_item_id=?) AS candidates`, [photo.id, fixture.id, fixture.id]);
        assert.deepEqual(Object.values(counts).map(Number), [stage === 'candidate_page' ? 1 : 0, 0], stage);
      }
    });

    await t.test('an owned worker process killed after claim is recovered and fenced from the replacement worker', async () => {
      const crashLost = await item('LOST', 'AI process termination fixture');
      const crashFound = await item('FOUND', 'AI process takeover target');
      const [lostPhoto] = await service.uploadImages(identity, crashLost.id, [{ mimetype: 'image/png', buffer: png }]);
      await service.uploadImages(identity, crashFound.id, [{ mimetype: 'image/png', buffer: png }]);
      await query(pool, "UPDATE ai_visual_jobs SET status='CANCELLED', locked_until=NULL, lease_token=NULL WHERE status='QUEUED' AND image_id<>?", [lostPhoto.id]);

      const child = spawn(process.execPath, [fileURLToPath(new URL('./ai-visual-claim-hold.js', import.meta.url)), name],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      const claimed = await new Promise((resolve, reject) => {
        let output = '';
        child.stdout.on('data', (chunk) => {
          output += chunk.toString();
          const end = output.indexOf('\n');
          if (end !== -1) {
            try { resolve(JSON.parse(output.slice(0, end))); }
            catch (error) { reject(error); }
          }
        });
        child.once('error', reject);
        child.once('exit', (code) => reject(new Error(`claim child exited before reporting a lease (${code}): ${stderr}`)));
      });
      assert.equal(String(claimed.image_id), String(lostPhoto.id));
      const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
      child.kill();
      const termination = await exited;
      assert.notEqual(termination.code, 0, 'child termination must not look like a clean worker completion');

      await query(pool, 'UPDATE ai_visual_jobs SET locked_until=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE job_id=?', [claimed.job_id]);
      const replacement = await aiRepository.claimNext(3);
      assert.ok(replacement);
      assert.notEqual(replacement.lease_token, claimed.lease_token);
      assert.equal(Number(replacement.attempts), 2);
      assert.equal(await aiRepository.saveEmbedding(claimed, direction), undefined);
      assert.equal(await aiRepository.upsertCandidates(claimed, crashLost.id, 'LOST', replacement.model_id, replacement.model_revision,
        [{ itemId: crashFound.id, score: 0.99 }]), false);
      const [[stillOwned]] = await query(pool, 'SELECT status, attempts, lease_token FROM ai_visual_jobs WHERE job_id=?', [claimed.job_id]);
      assert.equal(stillOwned.status, 'PROCESSING');
      assert.equal(Number(stillOwned.attempts), 2);
      assert.equal(stillOwned.lease_token, replacement.lease_token);
      assert.equal(await aiRepository.saveEmbedding(replacement, direction) !== undefined, true);
      assert.equal(await aiRepository.upsertCandidates(replacement, crashLost.id, 'LOST', replacement.model_id, replacement.model_revision,
        [{ itemId: crashFound.id, score: 1 }]), true);
      assert.equal(await aiRepository.finish(replacement, crashLost.id), true);
    });
    await t.test('snapshot waits for every pinned image and demo delivery is isolated, revalidated, and pair-deduplicated', async () => {
      const [[adminOwner]] = await query(pool, "SELECT user_id FROM users WHERE email='admin@ai-visual.example.test'");
      const [[cat]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
      const [[loc]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
      const [lostInsert] = await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
        VALUES(?,?,?,'DEMO ONLY LOST fixture','synthetic','LOST','2026-10-25','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [owner.user_id,cat.category_id,loc.location_id]);
      const [foundInsert] = await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
        VALUES(?,?,?,'DEMO ONLY FOUND fixture','synthetic','FOUND','2026-10-25','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [adminOwner.user_id,cat.category_id,loc.location_id]);
      const lostId = String(lostInsert.insertId), foundId = String(foundInsert.insertId), runId = randomUUID();
      await query(pool, 'INSERT INTO ai_visual_notification_preferences(user_id,enabled,updated_at) VALUES(?,TRUE,UTC_TIMESTAMP())', [owner.user_id]);
      await query(pool, `INSERT INTO ai_visual_demo_entities(run_id,user_id,item_id,entity_role,created_at) VALUES
        (?,?,NULL,'LOST_OWNER',UTC_TIMESTAMP()),(?,?,?,'LOST_ITEM',UTC_TIMESTAMP()),
        (?,?,NULL,'FOUND_OWNER',UTC_TIMESTAMP()),(?,?,?,'FOUND_ITEM',UTC_TIMESTAMP())`,
      [runId,owner.user_id,runId,owner.user_id,lostId,runId,adminOwner.user_id,runId,adminOwner.user_id,foundId]);
      const [[demoInputs]] = await query(pool, `SELECT i.status,i.type,u.account_status,p.enabled,
        (SELECT COUNT(*) FROM ai_visual_demo_entities WHERE item_id=i.item_id AND user_id=i.user_id AND entity_role='LOST_ITEM') AS marked
        FROM items i JOIN users u ON u.user_id=i.user_id JOIN ai_visual_notification_preferences p ON p.user_id=i.user_id WHERE i.item_id=?`, [lostId]);
      assert.deepEqual([demoInputs.status,demoInputs.type,demoInputs.account_status,Number(demoInputs.enabled),Number(demoInputs.marked)], ['OPEN','LOST','ACTIVE',1,1]);
      const [lostImage] = await query(pool, "INSERT INTO item_images(item_id,image_url,created_at) VALUES(?,'https://mock.invalid/demo-lost',UTC_TIMESTAMP())", [lostId]);
      const [foundImage] = await query(pool, "INSERT INTO item_images(item_id,image_url,created_at) VALUES(?,'https://mock.invalid/demo-found',UTC_TIMESTAMP())", [foundId]);
      await query(pool, `INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at) VALUES
        (?,? ,?,'QUEUED',0,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP()),(?,?,?,'QUEUED',0,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
      [lostImage.insertId,modelId,revision,foundImage.insertId,modelId,revision]);
      const demoService = createAiVisualSnapshotService(pool, { processingEnabled: true, shadowMode: false, demoNotificationsEnabled: true, demoMinCosine: 0.9 });
      assert.deepEqual(await Promise.all([demoService.processNext(), demoService.processNext()]), [false, false], 'concurrent workers share one incomplete generation without duplicate snapshots');
      const [[partial]] = await query(pool, "SELECT state FROM ai_visual_snapshots WHERE lost_item_id=? ORDER BY generation DESC LIMIT 1", [lostId]);
      assert.equal(partial.state, 'PENDING');
      const [[generationCount]] = await query(pool, 'SELECT COUNT(*) AS total FROM ai_visual_snapshots WHERE lost_item_id=?', [lostId]);
      assert.equal(Number(generationCount.total), 1);
      assert.equal(await demoService.deliverNextDemo(), false);
      const vector = encodeEmbedding([1, ...Array(511).fill(0)]);
      await query(pool, 'UPDATE ai_visual_jobs SET status=\'COMPLETED\' WHERE image_id IN (?,?)', [lostImage.insertId,foundImage.insertId]);
      await query(pool, `INSERT INTO item_image_embeddings(image_id,model_id,model_revision,dimensions,embedding_data,created_at) VALUES
        (?,?,?,512,?,UTC_TIMESTAMP()),(?,?,?,512,?,UTC_TIMESTAMP())`, [lostImage.insertId,modelId,revision,vector,foundImage.insertId,modelId,revision,vector]);
      assert.equal(await demoService.processNext(), true);
      const [[complete]] = await query(pool, "SELECT state FROM ai_visual_snapshots WHERE lost_item_id=? ORDER BY generation DESC LIMIT 1", [lostId]);
      assert.equal(complete.state, 'COMPLETE');
      const [[decision]] = await query(pool, "SELECT disposition,reason_code FROM ai_visual_notification_decisions WHERE lost_item_id=? AND found_item_id=? ORDER BY decision_id DESC LIMIT 1", [lostId,foundId]);
      assert.deepEqual(decision, { disposition: 'DEMO_ELIGIBLE', reason_code: 'DEMO_ONLY_FIXTURE_POLICY' });
      const shadowDemoService = createAiVisualSnapshotService(pool, { processingEnabled: true, shadowMode: true, demoNotificationsEnabled: true, demoMinCosine: 0.9 });
      assert.equal(await shadowDemoService.deliverNextDemo(), false, 'shadow mode fails closed even when a demo outbox event is pending');
      const [[shadowNotices]] = await query(pool, "SELECT COUNT(*) AS total FROM notifications WHERE type='AI_VISUAL_SIMILAR_ITEM' AND user_id=?", [owner.user_id]);
      assert.equal(Number(shadowNotices.total), 0, 'combined shadow/demo flags cannot create a user-visible notification');
      const before = await counts();
      assert.equal(await demoService.deliverNextDemo(), true);
      assert.equal(await demoService.deliverNextDemo(), false);
      const [[notices]] = await query(pool, "SELECT COUNT(*) AS total FROM notifications WHERE type='AI_VISUAL_SIMILAR_ITEM' AND user_id=?", [owner.user_id]);
      assert.equal(Number(notices.total), 1);
      const [secondFound] = await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
        VALUES(?,?,?,'DEMO ONLY later FOUND fixture','synthetic','FOUND','2026-10-25','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [adminOwner.user_id,cat.category_id,loc.location_id]);
      const secondFoundId = String(secondFound.insertId);
      const foreignRunId = randomUUID();
      await query(pool, `INSERT INTO ai_visual_demo_entities(run_id,user_id,item_id,entity_role,created_at) VALUES
        (?, ?, NULL, 'FOUND_OWNER', UTC_TIMESTAMP()), (?, ?, ?, 'FOUND_ITEM', UTC_TIMESTAMP())`, [foreignRunId,adminOwner.user_id,foreignRunId,adminOwner.user_id,secondFoundId]);
      const [secondImage] = await query(pool, "INSERT INTO item_images(item_id,image_url,created_at) VALUES(?,'https://mock.invalid/demo-found-2',UTC_TIMESTAMP())", [secondFoundId]);
      await query(pool, `INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at)
        VALUES(?,?,?,'COMPLETED',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [secondImage.insertId,modelId,revision]);
      await query(pool, `INSERT INTO item_image_embeddings(image_id,model_id,model_revision,dimensions,embedding_data,created_at)
        VALUES(?,?,?,512,?,UTC_TIMESTAMP())`, [secondImage.insertId,modelId,revision,vector]);
      await query(pool, 'UPDATE ai_visual_catalog_state SET revision=revision+1,updated_at=UTC_TIMESTAMP() WHERE state_id=1');
      assert.equal(await demoService.processNext(), true, 'a newly eligible FOUND row creates the next pinned generation');
      const [[generations]] = await query(pool, "SELECT COUNT(*) AS total FROM ai_visual_snapshots WHERE lost_item_id=? AND state='COMPLETE'", [lostId]);
      assert.equal(Number(generations.total), 2);
      assert.equal(await demoService.deliverNextDemo(), true, 'new-generation retry for the existing pair is idempotently delivered');
      assert.equal(await demoService.deliverNextDemo(), false, 'cross-run fixture markers cannot queue another demo alert');
      const [[originalPair]] = await query(pool, `SELECT COUNT(a.alert_id) AS alerts,COUNT(n.notification_id) AS notices
        FROM ai_visual_pair_alerts a LEFT JOIN notifications n ON n.user_id=a.recipient_id AND n.event_key=a.event_key
        WHERE a.recipient_id=? AND a.lost_item_id=? AND a.found_item_id=?`, [owner.user_id,lostId,foundId]);
      assert.deepEqual([Number(originalPair.alerts),Number(originalPair.notices)], [1,1]);
      const [[newPairNotice]] = await query(pool, 'SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND event_key=(SELECT event_key FROM ai_visual_pair_alerts WHERE recipient_id=? AND lost_item_id=? AND found_item_id=?)', [owner.user_id,owner.user_id,lostId,secondFoundId]);
      assert.equal(Number(newPairNotice.total), 0, 'FOUND item and owner markers from another run are rejected');
      const [[foreignRunDecision]] = await query(pool, 'SELECT disposition,reason_code FROM ai_visual_notification_decisions WHERE lost_item_id=? AND found_item_id=? ORDER BY decision_id DESC LIMIT 1', [lostId,secondFoundId]);
      assert.deepEqual(foreignRunDecision, { disposition: 'SUPPRESSED', reason_code: 'NO_VALIDATED_NOTIFICATION_POLICY' });
      const after = await counts();
      assert.equal(after[0], before[0], 'official Match rows unchanged');
      assert.equal(after[2], before[2], 'Claim rows unchanged');
    });
    await t.test('snapshot keyset acquisition reaches and completes LOST items beyond the first 100', async () => {
      const [[cat]] = await query(pool, 'SELECT category_id FROM categories ORDER BY category_id LIMIT 1');
      const [[loc]] = await query(pool, 'SELECT location_id FROM locations ORDER BY location_id LIMIT 1');
      await query(pool, "UPDATE items SET status='CLOSED',updated_at=UTC_TIMESTAMP() WHERE status='OPEN' AND type IN ('LOST','FOUND')");
      await query(pool, `INSERT INTO ai_visual_notification_preferences(user_id,enabled,updated_at)
        VALUES(?,TRUE,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE enabled=TRUE,updated_at=UTC_TIMESTAMP()`, [owner.user_id]);
      const total = 105;
      const itemsSql = Array(total).fill('(?,?,?, ?,\'pagination fixture\',\'LOST\',\'2026-10-25\',\'OPEN\',UTC_TIMESTAMP(),UTC_TIMESTAMP())').join(',');
      const itemsValues = Array.from({ length: total }, (_, index) => [owner.user_id,cat.category_id,loc.location_id,`AI-PAGINATION-${String(index).padStart(3,'0')}`]).flat();
      await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at) VALUES ${itemsSql}`, itemsValues);
      const [fixtures] = await query(pool, "SELECT item_id FROM items WHERE title LIKE 'AI-PAGINATION-%' ORDER BY item_id");
      assert.equal(fixtures.length, total);
      const imageSql = Array(total).fill('(?,?,UTC_TIMESTAMP())').join(',');
      const imageValues = fixtures.flatMap((row, index) => [row.item_id,`https://mock.invalid/pagination/${index}`]);
      await query(pool, `INSERT INTO item_images(item_id,image_url,created_at) VALUES ${imageSql}`, imageValues);
      const [images] = await query(pool, "SELECT image_id,item_id FROM item_images WHERE image_url LIKE 'https://mock.invalid/pagination/%' ORDER BY item_id");
      const jobSql = Array(total).fill('(?,?,?,\'COMPLETED\',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())').join(',');
      const jobValues = images.flatMap((row) => [row.image_id,modelId,revision]);
      await query(pool, `INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at) VALUES ${jobSql}`, jobValues);
      const embeddingSql = Array(total).fill('(?,?,?,512,?,UTC_TIMESTAMP())').join(',');
      const embeddingValues = images.flatMap((row) => [row.image_id,modelId,revision,direction]);
      await query(pool, `INSERT INTO item_image_embeddings(image_id,model_id,model_revision,dimensions,embedding_data,created_at) VALUES ${embeddingSql}`, embeddingValues);
      const pagedService = createAiVisualSnapshotService(pool, { processingEnabled: true, shadowMode: false, demoNotificationsEnabled: false });
      let completed = 0;
      for (let attempt = 0; attempt < 400 && completed < total; attempt++) {
        await pagedService.processNext();
        const [[count]] = await query(pool, `SELECT COUNT(*) AS total FROM ai_visual_snapshots
          WHERE state='COMPLETE' AND lost_item_id BETWEEN ? AND ?`, [fixtures[0].item_id,fixtures.at(-1).item_id]);
        completed = Number(count.total);
      }
      assert.equal(completed, total, 'all eligible LOST items, including those beyond the initial 100-row page, complete snapshots');
      const [[lastSnapshot]] = await query(pool, `SELECT s.state FROM ai_visual_snapshots s WHERE s.lost_item_id=? ORDER BY s.generation DESC LIMIT 1`, [fixtures.at(-1).item_id]);
      assert.equal(lastSnapshot.state, 'COMPLETE');
    });
  } finally {
    if (pool) await pool.end();
    try { if (created) await admin.query(`DROP DATABASE ${quote(name)}`); }
    finally { await admin.end(); }
  }
});
