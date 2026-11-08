import { assertIsolatedInstance, assertOwnedDatabase } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect, initialize } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createAdminModerationRepository } from '../repositories/admin-moderation.repository.js';
import { createAdminModerationService } from '../services/admin-moderation.service.js';
import { createVisualSuggestionsRepository } from '../repositories/visual-suggestions.repository.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { createAiVisualSnapshotService } from '../ai-visual/snapshot-service.js';
import { encodeEmbedding } from '../ai-visual/embeddings.js';
import { CLIP_MODEL_ID as model, CLIP_MODEL_REVISION as revision } from '../ai-visual/config.js';

test('moderation visibility is respected by AI reads, in-flight workers, snapshots and demo delivery', { timeout: 90000 }, async t => {
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const setup = await connect(base, false);
  let created = false, pool;
  try {
    await setup.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await initialize(setup, name); await migrate(setup, name);
    const password = randomBytes(20).toString('hex');
    await seed(setup, name, {USER: {email: 'owner@ai-visibility.test', password}, ADMIN: {email: 'admin@ai-visibility.test', password}});
    pool = createDbPool({...base, database: name});
    const [[owner]] = await query(pool, "SELECT user_id FROM users WHERE email='owner@ai-visibility.test'");
    const [[admin]] = await query(pool, "SELECT user_id FROM users WHERE email='admin@ai-visibility.test'");
    const [[category]] = await query(pool, 'SELECT category_id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id FROM locations LIMIT 1');
    const identity = {id: String(owner.user_id), role: 'USER'};
    const moderator = {id: String(admin.user_id), role: 'ADMIN'};
    const moderation = createAdminModerationService(createAdminModerationRepository(pool));
    const suggestions = createVisualSuggestionsService(createVisualSuggestionsRepository(pool), {enabled: true});
    const ai = createAiVisualRepository(pool);
    const vector = [1, ...Array(511).fill(0)], encoded = encodeEmbedding(vector), run = randomUUID();
    const fixtures = [];
    for (const type of ['LOST', 'FOUND']) {
      const [item] = await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
        VALUES(?,?,?,?,'Synthetic visibility fixture',?,'2026-11-07','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [owner.user_id, category.category_id, location.location_id, 'Visibility ' + type, type]);
      const [image] = await query(pool, "INSERT INTO item_images(item_id,image_url,cloudinary_public_id,created_at) VALUES(?,'https://fixture.invalid/image.png',?,UTC_TIMESTAMP())", [item.insertId, 'findit/items/' + randomUUID()]);
      await query(pool, 'INSERT INTO item_image_embeddings(image_id,model_id,model_revision,dimensions,embedding_data,created_at) VALUES(?,?,?,512,?,UTC_TIMESTAMP())', [image.insertId, model, revision, encoded]);
      await query(pool, "INSERT INTO ai_visual_jobs(image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at) VALUES(?,?,?,'COMPLETED',1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())", [image.insertId, model, revision]);
      for (const [role, id] of [[type + '_ITEM', item.insertId], [type + '_OWNER', null]]) await query(pool, 'INSERT INTO ai_visual_demo_entities(run_id,user_id,item_id,entity_role,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())', [run, owner.user_id, id, role]);
      fixtures.push({id: String(item.insertId), imageId: String(image.insertId)});
    }
    const [lost, found] = fixtures;
    await query(pool, 'INSERT INTO ai_visual_notification_preferences(user_id,enabled,updated_at) VALUES(?,TRUE,UTC_TIMESTAMP())', [owner.user_id]);
    const candidate = () => query(pool, 'INSERT INTO ai_visual_candidates(lost_item_id,found_item_id,model_id,model_revision,cosine_score,updated_at) VALUES(?,?,?,?,1,UTC_TIMESTAMP())', [lost.id, found.id, model, revision]);
    const count = async () => Number((await query(pool, 'SELECT COUNT(*) AS n FROM ai_visual_candidates WHERE lost_item_id=? AND found_item_id=?', [lost.id, found.id]))[0][0].n);
    const notifications = async () => Number((await query(pool, "SELECT COUNT(*) AS n FROM notifications WHERE type='AI_VISUAL_SIMILAR_ITEM'"))[0][0].n);
    const change = (item, visibility) => moderation.setItemVisibility(moderator, Number(item.id), {visibility, reason: 'Synthetic release regression'});
    const catalog = async () => String((await query(pool, 'SELECT revision FROM ai_visual_catalog_state WHERE state_id=1'))[0][0].revision);
    let inferenceCalls = 0;
    const worker = createAiVisualWorker({repository: ai, config: {enabled: true, maxAttempts: 3, pollMs: 250},
      imageSource: {async download() {return {filePath: 'fixture', async cleanup() {}};}},
      encoder: {async embedFile() {inferenceCalls++; return {vector, inferenceMs: 1};}}});
    const drain = async () => { for (let i = 0; i < 10; i++) if (!await worker.processNext()) return; assert.fail('Fixture jobs did not drain'); };
    await candidate();

    await t.test('hiding FOUND bumps catalog, clears candidates and rejects a worker page read before moderation', async () => {
      assert.equal((await suggestions.forOwner(identity, Number(lost.id)))[0].itemId, Number(found.id));
      await query(pool, "UPDATE ai_visual_jobs SET status='QUEUED',attempts=0 WHERE image_id=?", [lost.imageId]);
      const job = await ai.claimNext(3);
      assert.equal(String(job.image_id), lost.imageId);
      const page = await ai.oppositeEmbeddingPage(lost.id, 'LOST', model, revision, '0');
      assert.ok(page.some(row => String(row.item_id) === found.id));
      const before = await catalog(); await change(found, 'HIDDEN');
      assert.notEqual(await catalog(), before); assert.equal(await count(), 0);
      await ai.upsertCandidates(job, lost.id, 'LOST', model, revision, [{itemId: found.id, score: 1}]);
      assert.equal(await count(), 0);
      assert.equal(await ai.finish(job, lost.id), true);
      await candidate(); // Simulate a stale row: API must independently filter it.
      assert.deepEqual(await suggestions.forOwner(identity, Number(lost.id)), []);
    });
    await t.test('restoring FOUND clears stale data and requeues completed jobs to rebuild fresh suggestions', async () => {
      await change(found, 'PUBLIC'); assert.equal(await count(), 0);
      const [[job]] = await query(pool, 'SELECT status FROM ai_visual_jobs WHERE image_id=?', [found.imageId]);
      assert.equal(job.status, 'QUEUED'); await drain();
      assert.equal(await count(), 1);
      assert.equal((await suggestions.forOwner(identity, Number(lost.id)))[0].itemId, Number(found.id));
    });
    await t.test('hidden LOST is owner-ineligible and its job cancels before image download/inference', async () => {
      await change(lost, 'HIDDEN');
      await assert.rejects(() => suggestions.forOwner(identity, Number(lost.id)), error => error.status === 404);
      const before = inferenceCalls;
      await query(pool, "UPDATE ai_visual_jobs SET status='QUEUED',attempts=0 WHERE image_id=?", [lost.imageId]);
      await drain(); assert.equal(inferenceCalls, before);
      assert.deepEqual(await ai.oppositeEmbeddingPage(found.id, 'FOUND', model, revision, '0'), []);
      await change(lost, 'PUBLIC'); await drain(); assert.equal(await count(), 1);
    });
    const snapshots = createAiVisualSnapshotService(pool, {processingEnabled: true, demoNotificationsEnabled: true, demoMinCosine: 0.95});
    await t.test('visibility change invalidates completed snapshot delivery and excludes hidden FOUND from new manifests', async () => {
      assert.equal(await snapshots.processNext(), true);
      await change(found, 'HIDDEN'); assert.equal(await snapshots.deliverNextDemo(), true);
      assert.equal(await notifications(), 0);
      assert.equal(await snapshots.processNext(), true);
      const [[snapshot]] = await query(pool, 'SELECT state,manifest FROM ai_visual_snapshots WHERE lost_item_id=? ORDER BY generation DESC LIMIT 1', [lost.id]);
      const manifest = typeof snapshot.manifest === 'string' ? JSON.parse(snapshot.manifest) : snapshot.manifest;
      assert.equal(snapshot.state, 'COMPLETE'); assert.deepEqual(manifest.found, []);
    });
    await t.test('delivery rechecks hidden state even when a synthetic external audit writer omits revision tracking', async () => {
      await change(found, 'PUBLIC'); await drain(); assert.equal(await snapshots.processNext(), true);
      await query(pool, "INSERT INTO activity_logs(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,'ITEM_HIDDEN','ITEM',?,'{}',UTC_TIMESTAMP())", [admin.user_id, found.id]);
      assert.equal(await snapshots.deliverNextDemo(), true); assert.equal(await notifications(), 0);
    });
    await t.test('restored synthetic pair can notify once, retries deduplicate and shadow never delivers', async () => {
      await change(found, 'PUBLIC'); await drain(); assert.equal(await snapshots.processNext(), true);
      const shadow = createAiVisualSnapshotService(pool, {processingEnabled: true, demoNotificationsEnabled: true, shadowMode: true});
      assert.equal(await shadow.deliverNextDemo(), false); assert.equal(await notifications(), 0);
      assert.equal(await snapshots.deliverNextDemo(), true); assert.equal(await snapshots.deliverNextDemo(), false);
      assert.equal(await notifications(), 1);
    });
  } finally {
    if (pool) await pool.end();
    try {if (created) {assertOwnedDatabase(name, name); await setup.query(`DROP DATABASE \`${name}\``);}}
    finally {await setup.end();}
  }
});
