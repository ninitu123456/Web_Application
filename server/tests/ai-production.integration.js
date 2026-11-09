// Database/locking are real; Cloudinary and CLIP are deliberately mocked.
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { backfillAiVisual } from '../ai-visual/backfill.js';
import { assertAiVisualSchema } from '../ai-visual/schema-check.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { createVisualSuggestionsRepository } from '../repositories/visual-suggestions.repository.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { startServer } from '../server.js';
import { readConfig } from '../config/env.js';
import { createTokenService } from '../utils/jwt.js';

test('production suggestion pipeline: resumable backfill, lease, owner, freshness and AI-off cleanup', { timeout: 90000 }, async t => {
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const admin = await connect(base, false);
  let created = false, pool;
  try {
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await admin.query(`USE \`${name}\``); await migrate(admin, name);
    const password = randomBytes(18).toString('hex');
    await seed(admin, name, { USER: { email: 'user@production-ai.test', password }, ADMIN: { email: 'admin@production-ai.test', password } });
    pool = createDbPool({ ...base, database: name });
    await assertAiVisualSchema(pool);
    const [users] = await query(pool, 'SELECT user_id FROM users ORDER BY user_id');
    const [[category]] = await query(pool, 'SELECT category_id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations LIMIT 1');
    const items = [];
    for (const [index, type] of ['LOST', 'FOUND', 'FOUND'].entries()) {
      const [item] = await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
        VALUES(?,?,?,'Synthetic fixture','No real data',?,'2026-11-08','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [users[index === 0 ? 0 : 1].user_id, category.category_id, location.location_id, type]);
      const [image] = await query(pool, `INSERT INTO item_images(item_id,image_url,cloudinary_public_id,created_at) VALUES(?,'https://fixture.invalid/image.jpg',?,UTC_TIMESTAMP())`,
        [item.insertId, index === 2 ? 'https://untrusted.invalid/image.jpg' : 'findit/items/' + randomUUID()]);
      items.push({ id: String(item.insertId), image: String(image.insertId) });
    }
    const [lost, found] = items;
    const identity = { id: String(users[0].user_id), role: 'USER' };
    const repository = createVisualSuggestionsRepository(pool);
    const suggestions = createVisualSuggestionsService(repository, { enabled: true, production: true });
    const ai = createAiVisualRepository(pool);
    const drain = async () => {
      const worker = createAiVisualWorker({ repository: ai, config: { enabled: true, maxAttempts: 3, pollMs: 250 },
        imageSource: { async download(publicId) { assert.match(publicId, /^findit\/items\//); return { filePath: 'synthetic', async cleanup() {} }; } },
        encoder: { async embedFile() { return { vector: [1, ...Array(511).fill(0)], inferenceMs: 0 }; } } });
      for (let count = 0; count < 10; count++) if (!await worker.processNext()) return;
      assert.fail('queue did not drain');
    };
    await t.test('backfill is idempotent and skips arbitrary URLs', async () => {
      assert.equal((await backfillAiVisual(pool)).changedJobs, 2);
      assert.equal((await backfillAiVisual(pool)).changedJobs, 0);
      const concurrent = await Promise.all([backfillAiVisual(pool), backfillAiVisual(pool)]);
      assert.deepEqual(concurrent.map(result => result.changedJobs), [0, 0]);
      assert.equal(await repository.processingState(lost.id), 'processing');
      const job = await ai.claimNext(3);
      await backfillAiVisual(pool, { rebuild: true, retryFailed: true });
      assert.ok(await ai.renewLease(job), 'backfill cannot steal processing lease');
      await ai.cancel(job);
      assert.equal((await backfillAiVisual(pool)).changedJobs, 1);
      await drain();
      assert.equal((await backfillAiVisual(pool)).changedJobs, 0);
    });
    await t.test('completed suggestions remain owner scoped and read only', async () => {
      const [[before]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM claims) c,(SELECT COUNT(*) FROM matches) m,(SELECT COUNT(*) FROM notifications) n');
      const result = await suggestions.forOwner(identity, lost.id, { withState: true });
      assert.equal(result.visualState, 'ready'); assert.equal(result.data[0].itemId, Number(found.id));
      await assert.rejects(() => suggestions.forOwner({ ...identity, id: String(users[1].user_id) }, lost.id), e => e.status === 404);
      const [[after]] = await query(pool, 'SELECT (SELECT COUNT(*) FROM claims) c,(SELECT COUNT(*) FROM matches) m,(SELECT COUNT(*) FROM notifications) n');
      assert.deepEqual(after, before);
    });
    await t.test('expired worker lease resumes matching from the persisted embedding with no inference', async () => {
      assert.equal((await backfillAiVisual(pool, { rebuild: true, itemIds: [lost.id] })).changedJobs, 1);
      const abandoned = await ai.claimNext(3);
      assert.equal(String(abandoned.image_id), lost.image);
      const cached = await ai.existingEmbedding(abandoned);
      assert.equal(cached.length, 512);
      assert.equal(await ai.existingEmbedding({ ...abandoned, cloudinary_public_id: 'findit/items/other' }), undefined);
      await query(pool, 'UPDATE item_image_embeddings SET embedding_data=? WHERE image_id=?', [Buffer.alloc(2048), lost.image]);
      assert.equal(await ai.existingEmbedding(abandoned), undefined, 'invalid vector must be inferred again');
      const bytes = Buffer.alloc(2048); cached.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
      await query(pool, 'UPDATE item_image_embeddings SET embedding_data=? WHERE image_id=?', [bytes, lost.image]);
      await query(pool, 'UPDATE ai_visual_jobs SET locked_until=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE job_id=?', [abandoned.job_id]);
      const restarted = createAiVisualWorker({ repository: createAiVisualRepository(pool), config: { enabled: true, maxAttempts: 3 },
        encoder: { async embedFile() { assert.fail('restart must reuse the saved vector'); } },
        imageSource: { async download() { assert.fail('restart must not redownload'); } } });
      await restarted.processNext();
      assert.equal(await ai.renewLease(abandoned), false);
      assert.equal((await suggestions.forOwner(identity, lost.id)).length, 1);
      assert.equal((await backfillAiVisual(pool, { itemIds: [found.id] })).scannedItems, 1);
      const [[state]] = await query(pool, 'SELECT status,attempts FROM ai_visual_jobs WHERE image_id=?', [lost.image]);
      assert.equal(state.status, 'COMPLETED'); assert.equal(Number(state.attempts), 2);
    });
    await t.test('production-configured HTTP API starts without a model and protects suggestions', async () => {
      const config = readConfig({ NODE_ENV: 'production', AI_VISUAL_MODE: 'production', AI_VISUAL_SERVICE_ROLE: 'api',
        DB_HOST: base.host, DB_PORT: String(base.port), DB_NAME: 'findit_db', DB_USER: base.user, DB_PASSWORD: base.password,
        JWT_SECRET: randomBytes(32).toString('hex'), AI_VISUAL_SUGGESTIONS_ENABLED: 'true' });
      // Only this already-verified disposable database is used. Production mode
      // itself receives no fake isolation datadir and no development NODE_ENV.
      // The normal API health contract requires findit_db. The isolated runner
      // already migrated/seeded that database on this same disposable instance.
      const runtime = await startServer({ ...config, port: 0 });
      try {
        const [[actor]] = await query(runtime.pool, 'SELECT user_id,session_version FROM users LIMIT 1');
        const token = createTokenService(config.auth).sign(actor.user_id, actor.session_version);
        const url = `http://127.0.0.1:${runtime.server.address().port}/api/items/2147483647/visual-suggestions`;
        assert.equal((await fetch(url)).status, 401);
        const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        assert.equal(response.status, 404);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(config.aiVisual.enabled, false);
      } finally { await runtime.close(); }
    });
    await t.test('failed/rebuilt jobs hide old scores; explicit retry is bounded and deduplicated', async () => {
      await query(pool, "UPDATE ai_visual_jobs SET status='FAILED',attempts=3 WHERE image_id=?", [lost.image]);
      assert.equal((await backfillAiVisual(pool)).changedJobs, 0);
      assert.equal((await suggestions.forOwner(identity, lost.id, { withState: true })).visualState, 'error');
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      assert.equal((await backfillAiVisual(pool, { retryFailed: true })).changedJobs, 1);
      assert.equal((await backfillAiVisual(pool, { retryFailed: true })).changedJobs, 0);
      await drain();
      assert.equal((await suggestions.forOwner(identity, lost.id)).length, 1);
      assert.equal((await backfillAiVisual(pool, { rebuild: true })).changedJobs, 2);
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      await drain();
      const [[count]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_candidates'); assert.equal(Number(count.n), 1);
    });
    await t.test('adding a current image hides the old pair until backfill completes; AI-off removal can rebuild it', async subtest => {
      const [extra] = await query(pool, `INSERT INTO item_images(item_id,image_url,cloudinary_public_id,created_at)
        VALUES(?,'https://fixture.invalid/new-image.jpg',?,UTC_TIMESTAMP())`, [found.id, 'findit/items/' + randomUUID()]);
      const removeExtra = () => createItemRepository(pool).withLockedItem(found.id, async scoped => {
        await scoped.deleteAiVisualDataIfPresent(found.id, extra.insertId);
        await scoped.deleteImage(extra.insertId);
      });
      // A failed assertion must not leave this photo/job for later subtests.
      subtest.after(async () => {
        if (await createItemRepository(pool).findImage(extra.insertId)) {
          await removeExtra();
          await backfillAiVisual(pool, { rebuild: true });
          await drain();
        }
      });
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      assert.equal((await backfillAiVisual(pool)).changedJobs, 1);
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      await drain();
      const [[pairs]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_candidates');
      assert.equal(Number(pairs.n), 1, 'the fixture has one stored pair, not one pair per photo');
      const [jobs] = await query(pool, 'SELECT image_id,status FROM ai_visual_jobs ORDER BY image_id');
      assert.deepEqual(jobs.map(row => [String(row.image_id), row.status]),
        [lost.image, found.image, String(extra.insertId)].sort((a, b) => Number(a) - Number(b)).map(id => [id, 'COMPLETED']));
      assert.deepEqual((await suggestions.forOwner(identity, lost.id)).map(row => row.itemId), [Number(found.id)]);
      // MySQL 8.0.46 can choose DuplicateWeedout and repeat the same FOUND
      // for its two images. Exercise that valid plan without relying on stats,
      // platform defaults, timing, or the order of the backfilled image jobs.
      const connection = await pool.getConnection();
      const [[settings]] = await connection.query('SELECT @@optimizer_switch AS optimizer_switch');
      try {
        await connection.query('SET SESSION optimizer_switch=?',
          ['firstmatch=off,loosescan=off,duplicateweedout=on,block_nested_loop=off,subquery_to_derived=off']);
        const planned = createVisualSuggestionsService(createVisualSuggestionsRepository(pool,
          (sql, values = []) => connection.query(sql, values)), { enabled: true, production: true });
        assert.deepEqual((await planned.forOwner(identity, lost.id)).map(row => row.itemId), [Number(found.id)]);
      } finally {
        try { await connection.query('SET SESSION optimizer_switch=?', [settings.optimizer_switch]); }
        finally { connection.release(); }
      }
      await removeExtra();
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      assert.equal((await backfillAiVisual(pool, { rebuild: true })).changedJobs, 2);
      await drain();
      assert.equal((await suggestions.forOwner(identity, lost.id)).length, 1);
    });
    await t.test('suspended owner and terminal Claim lifecycle never expose stale candidates', async () => {
      await query(pool, "UPDATE users SET account_status='SUSPENDED' WHERE user_id=?", [users[1].user_id]);
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [users[1].user_id]);
      await query(pool, "UPDATE items SET status='RETURNED' WHERE item_id=?", [found.id]);
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      await query(pool, "UPDATE items SET status='OPEN' WHERE item_id=?", [found.id]);
    });
    await t.test('AI-off image deletion invalidates candidates and can rebuild after re-enable', async () => {
      await createItemRepository(pool).withLockedItem(found.id, async scoped => {
        await scoped.deleteAiVisualDataIfPresent(found.id, found.image);
        await scoped.deleteImage(found.image);
      });
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
      const [[jobs]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_jobs'); assert.equal(Number(jobs.n), 1);
      assert.equal((await backfillAiVisual(pool, { rebuild: true })).changedJobs, 1);
      await drain();
      assert.deepEqual(await suggestions.forOwner(identity, lost.id), []);
    });
    await t.test('missing required schema is a startup error with no SQL details', async () => {
      await query(pool, 'DROP TABLE ai_visual_candidates');
      await assert.rejects(() => assertAiVisualSchema(pool), e => e.code === 'INVALID_CONFIG' && !e.message.includes(name));
    });
  } finally {
    await pool?.end();
    try { if (created) await admin.query(`DROP DATABASE \`${name}\``); } finally { await admin.end(); }
  }
});
