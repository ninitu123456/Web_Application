import { createSuggestionsService } from '../services/suggestions.service.js';
import { createSuggestionsRepository } from '../repositories/suggestions.repository.js';
// Opt-in, real pinned CLIP inference. Invoked only by the disposable runner's
// --ai-real-e2e mode, never skipped or substituted in ordinary CI regression.
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createApp } from '../app.js';
import { createUserRepository } from '../repositories/user.repository.js';
import { createUserService } from '../services/user.service.js';
import { createAuthService } from '../services/auth.service.js';
import { createTokenService } from '../utils/jwt.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createImageOperations } from '../services/image-operations.js';
import { createLookupRepository } from '../repositories/lookup.repository.js';
import { createLookupService } from '../services/lookup.service.js';
import { createVisualSuggestionsRepository } from '../repositories/visual-suggestions.repository.js';
import { createVisualSuggestionsService } from '../services/visual-suggestions.service.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createAdminService } from '../services/admin.service.js';
import { createNotificationRepository } from '../repositories/notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';
import { createAiVisualRepository } from '../ai-visual/repository.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { createClipEncoder } from '../ai-visual/clip-encoder.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION, readAiVisualConfig } from '../ai-visual/config.js';
import { decodeEmbedding, cosineSimilarity } from '../ai-visual/embeddings.js';
import { createSyntheticAiCorpus, readAiCorpus, retrievalMetrics } from '../scripts/ai-e2e-corpus.js';
import { serveApp, request } from './auth/helpers.js';
import { realAiBrowser } from '../../client/scripts/ai-real-browser-check.mjs';

test('real CLIP: upload -> jobs -> embeddings -> matching -> owner API -> browser, on disposable MySQL', { timeout: 300000 }, async t => {
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const setup = await connect(base, false), workspace = await mkdtemp(resolve(tmpdir(), 'findit-ai-e2e-'));
  const artifacts = fileURLToPath(new URL('../../.cache/ci-ai-e2e-20261109/ai-real/', import.meta.url));
  const originalFetch = globalThis.fetch;
  let pool, http, browser, encoder, created = false;
  try {
    await mkdir(artifacts, { recursive: true });
    const synthetic = !process.env.FINDIT_AI_E2E_CORPUS;
    const corpusRoot = synthetic ? resolve(workspace, 'corpus') : process.env.FINDIT_AI_E2E_CORPUS;
    if (synthetic) await createSyntheticAiCorpus(corpusRoot);
    const corpus = await readAiCorpus(corpusRoot);
    const splitHashes = new Map(); let exactDuplicateQueryGalleryPairs = 0;
    for (const entry of corpus) for (const image of entry.images) {
      const hash = createHash('sha256').update(await readFile(image)).digest('hex');
      const counts = splitHashes.get(hash) ?? { LOST: 0, FOUND: 0 }; counts[entry.type]++; splitHashes.set(hash, counts);
    }
    for (const counts of splitHashes.values()) exactDuplicateQueryGalleryPairs += counts.LOST * counts.FOUND;
    await setup.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await setup.query(`USE \`${name}\``); await migrate(setup, name);
    const password = randomBytes(18).toString('hex');
    await seed(setup, name, { USER: { email: 'owner@real-ai.example.test', password }, ADMIN: { email: 'finder@real-ai.example.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [actors] = await query(pool, 'SELECT u.user_id id,r.name role FROM users u JOIN roles r ON r.role_id=u.role_id');
    const owner = actors.find(actor => actor.role === 'USER'), finder = actors.find(actor => actor.role === 'ADMIN');
    owner.id = String(owner.id); finder.id = String(finder.id);
    const [moderatorRow] = await query(pool, `INSERT INTO users(full_name,email,password_hash,role_id,account_status,created_at,updated_at)
      SELECT 'Isolated moderator','moderator@real-ai.example.test',password_hash,role_id,'ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM users WHERE user_id=?`, [finder.id]);
    const moderator = { id: String(moderatorRow.insertId), role: 'ADMIN' };
    const [[category]] = await query(pool, 'SELECT category_id id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id id FROM locations LIMIT 1');
    const config = readAiVisualConfig({ NODE_ENV: 'test', AI_VISUAL_MATCHING_ENABLED: 'true',
      AI_VISUAL_MATCHING_CLOUD_NAME: 'local-ai-e2e', CLOUDINARY_CLOUD_NAME: 'local-ai-e2e',
      FINDIT_ISOLATED_DATADIR: process.env.FINDIT_ISOLATED_DATADIR, DB_HOST: base.host, DB_PORT: String(base.port),
      AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED: 'false', AI_VISUAL_NOTIFICATION_SHADOW_MODE: 'false', AI_VISUAL_NOTIFICATION_DEMO_ENABLED: 'false' });
    const assets = new Map(); let origin;
    const storage = {
      async upload(bytes, mimetype, publicId) {
        assert.match(publicId, /^findit\/items\/[a-f0-9-]+$/);
        const path = resolve(workspace, basename(publicId)); await writeFile(path, bytes);
        assets.set(publicId, { path, mimetype });
        return { publicId, url: origin + '/__ai-e2e-images/' + basename(publicId) };
      },
      async destroy(publicId) { const asset = assets.get(publicId); if (asset) { await rm(asset.path); assets.delete(publicId); } }
    };
    const users = createUserRepository(pool), auth = createAuthService(users, createTokenService({ secret: randomBytes(32).toString('hex'), expiresIn: 3600 }));
    const items = createItemService(createItemRepository(pool), storage, createImageOperations(pool, storage), config);
    const claims = createClaimService(createClaimRepository(pool));
    const admins = createAdminService(createAdminRepository(pool), items);
    const suggestions = createVisualSuggestionsService(createVisualSuggestionsRepository(pool), { enabled: true });
    const apiApp = createApp({ suggestionsService: createSuggestionsService(createSuggestionsRepository(pool, { visualEnabled: true })), healthService: { async check() { return {}; } }, authService: auth, userService: createUserService(users),
      itemService: items, lookupService: createLookupService(createLookupRepository(pool)), visualSuggestionsService: suggestions,
      matchingService: createMatchingService(createMatchingRepository(pool)), claimService: claims,
      notificationService: createNotificationService(createNotificationRepository(pool)), security: { apiMax: 5000, uploadMax: 200 } });
    const app = express(), dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
    app.get('/__ai-e2e-images/:id', async (req, res) => {
      const asset = [...assets.entries()].find(([publicId]) => basename(publicId) === req.params.id)?.[1];
      if (!asset) return res.sendStatus(404);
      res.type(asset.mimetype).send(await readFile(asset.path));
    });
    app.use((req, res, next) => req.path.startsWith('/api/') ? apiApp(req, res, next) : next());
    app.use(express.static(dist)); app.get(/.*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
    http = await serveApp(app); origin = http.url;
    // No Cloudinary, email, model-download or other external HTTP is permitted.
    globalThis.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin !== origin) throw new Error('AI_E2E_EXTERNAL_NETWORK_FORBIDDEN');
      return originalFetch(input, options);
    };
    const login = async email => {
      const result = await request(http, '/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(result.status, 200); return result.json.data.token;
    };
    const ownerToken = await login('owner@real-ai.example.test'), finderToken = await login('finder@real-ai.example.test');
    browser = await realAiBrowser({ url: origin, email: 'owner@real-ai.example.test', password, artifacts });
    const corpusByItem = new Map();
    await t.test('actual browser and HTTP multipart uploads enqueue each original photograph', async () => {
      for (const [index, entry] of corpus.entries()) {
        const token = entry.type === 'LOST' ? ownerToken : finderToken;
        const result = await request(http, '/api/items', { method: 'POST', token, body: {
          title: 'CLIP evaluation ' + entry.id, description: 'Non-sensitive isolated evaluation image', type: entry.type,
          categoryId: Number(category.id), locationId: Number(location.id), eventDate: '2026-11-09'
        } });
        assert.equal(result.status, 201, result.json.message); entry.itemId = result.json.data.id; corpusByItem.set(Number(entry.itemId), entry);
        if (index === 0) await browser.upload(entry.itemId, entry.images);
        else {
          const body = new FormData();
          for (const path of entry.images) body.append('images', new Blob([await readFile(path)], { type: extname(path).toLowerCase() === '.png' ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg' }), basename(path));
          const response = await fetch(origin + `/api/items/${entry.itemId}/images`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body });
          assert.equal(response.status, 201, await response.text());
        }
      }
      const [[jobs]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_jobs');
      assert.equal(Number(jobs.n), corpus.reduce((count, entry) => count + entry.images.length, 0));
    });
    const rssBefore = process.memoryUsage().rss, measurements = [], events = [];
    encoder = await createClipEncoder({ cacheDir: process.env.AI_VISUAL_MATCHING_CACHE_DIR });
    let rssPeak = process.memoryUsage().rss, injectFailure = false;
    const sampling = setInterval(() => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); }, 20);
    t.after(() => clearInterval(sampling)); sampling.unref();
    const worker = createAiVisualWorker({ repository: createAiVisualRepository(pool), config, onEvent: event => events.push(event),
      imageSource: { async download(publicId) { if (injectFailure) { injectFailure = false; throw new Error('Controlled local storage transient failure'); }
        const asset = assets.get(publicId); assert.ok(asset, 'worker can read only assets uploaded during this run'); return { filePath: asset.path, async cleanup() {} }; } },
      encoder: { async embedFile(path) { const result = await encoder.embedFile(path); measurements.push({ inferenceMs: result.inferenceMs, dimensions: result.vector.length }); return result; } }
    });
    const drain = async () => {
      for (let count = 0; count < 110; count++) if (!await worker.processNext()) return;
      assert.fail('AI queue failed to drain within bounded work');
    };
    await t.test('transient storage failure retains a bounded retry then real CLIP completes every image', async () => {
      injectFailure = true; await worker.processNext();
      const [[failed]] = await query(pool, "SELECT * FROM ai_visual_jobs WHERE status='QUEUED' AND attempts=1");
      assert.ok(failed); assert.ok(failed.last_error_code);
      assert.equal(Number(failed.attempts), 1);
      await query(pool, 'UPDATE ai_visual_jobs SET available_at=UTC_TIMESTAMP() WHERE job_id=?', [failed.job_id]);
      await drain();
      const [jobs] = await query(pool, 'SELECT status,attempts FROM ai_visual_jobs');
      assert.ok(jobs.every(job => job.status === 'COMPLETED')); assert.equal(jobs.filter(job => Number(job.attempts) === 2).length, 1);
      const [embeddings] = await query(pool, 'SELECT dimensions,OCTET_LENGTH(embedding_data) bytes,embedding_data FROM item_image_embeddings');
      assert.equal(embeddings.length, assets.size);
      for (const embedding of embeddings) {
        assert.equal(embedding.dimensions, 512); assert.equal(Number(embedding.bytes), 2048);
        assert.ok(Math.abs(Math.hypot(...decodeEmbedding(embedding.embedding_data)) - 1) < 0.00001);
      }
    });
    const predictions = {}, queryItems = corpus.filter(entry => entry.type === 'LOST');
    await t.test('persisted cosine scores and owner HTTP results match the real vectors; anonymous and other-owner requests are denied', async () => {
      for (const entry of queryItems) {
        const path = `/api/items/${entry.itemId}/visual-suggestions`;
        assert.equal((await request(http, path)).status, 401);
        assert.equal((await request(http, path, { token: finderToken })).status, 404);
        const result = await request(http, path, { token: ownerToken });
        assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.json.visualState, 'ready');
        const [vectors] = await query(pool, 'SELECT im.item_id,e.embedding_data FROM item_image_embeddings e JOIN item_images im ON im.image_id=e.image_id');
        const expected = corpus.filter(item => item.type === 'FOUND').map(item => ({ itemId: Number(item.itemId), score: Math.max(...vectors.filter(v => Number(v.item_id) === Number(entry.itemId)).flatMap(q => vectors.filter(v => Number(v.item_id) === Number(item.itemId)).map(g => cosineSimilarity(decodeEmbedding(q.embedding_data), decodeEmbedding(g.embedding_data))))) }))
          .sort((a, b) => b.score - a.score || a.itemId - b.itemId).slice(0, 3);
        assert.deepEqual(result.json.data.map(item => item.itemId), expected.map(item => item.itemId));
        for (const [index, item] of result.json.data.entries()) assert.ok(Math.abs(item.cosineScore - expected[index].score) < 0.00001);
        predictions[entry.id] = result.json.data.map(item => ({ id: corpusByItem.get(item.itemId).id, cosineScore: item.cosineScore }));
      }
    });
    await t.test('desktop and mobile UI renders the real API ranking, scores and uploaded images without a fixture label', async () => {
      const entry = queryItems[0], result = await request(http, `/api/items/${entry.itemId}/visual-suggestions`, { token: ownerToken });
      await browser.suggestions(entry.itemId, result.json.data, true);
      assert.equal((await items.list({ page: 1, limit: 10 })).data.length > 0, true);
    });
    await t.test('FOUND owner sees real reverse LOST rankings in API and unified browser; other owners including ADMIN are denied',async()=>{
      const found=corpus.find(item=>item.type==='FOUND');
      const path='/api/items/'+found.itemId+'/visual-suggestions';
      assert.equal((await request(http,path)).status,401);
      assert.equal((await request(http,path,{token:ownerToken})).status,404);
      const result=await request(http,path,{token:finderToken});assert.equal(result.status,200);
      const [expected]=await query(pool,'SELECT lost_item_id,cosine_score FROM ai_visual_candidates WHERE found_item_id=? ORDER BY cosine_score DESC,lost_item_id ASC LIMIT 3',[found.itemId]);
      assert.deepEqual(result.json.data.map(row=>row.itemId),expected.map(row=>Number(row.lost_item_id)));
      const unified=await request(http,'/api/items/'+found.itemId+'/suggestions?limit=6',{token:finderToken});
      assert.equal(unified.status,200);assert.ok(unified.json.data.visual.every(row=>row.item.type==='LOST'));
      await browser.loginAs('finder@real-ai.example.test',password);
      await browser.suggestions(found.itemId,result.json.data,'found');
      await browser.loginAs('owner@real-ai.example.test',password);
    });
    const metrics = retrievalMetrics(corpus, predictions), gallery = corpus.filter(item => item.type === 'FOUND');
    const assertAbsent = async id => {
      for (const entry of queryItems) {
        const result = await request(http, `/api/items/${entry.itemId}/visual-suggestions`, { token: ownerToken });
        assert.equal(result.status, 200); assert.ok(!result.json.data.some(item => item.itemId === Number(id)));
      }
    };
    await t.test('hide/restore and close invalidate real-image suggestions through application services', async () => {
      const found = gallery[0];
      await admins.setItemVisibility(moderator, Number(found.itemId), { visibility: 'HIDDEN', reason: 'Isolated CLIP lifecycle regression' });
      await assertAbsent(found.itemId);
      await admins.setItemVisibility(moderator, Number(found.itemId), { visibility: 'PUBLIC', reason: 'Isolated CLIP restore' });
      await drain();
      const [[restored]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_candidates WHERE found_item_id=?', [found.itemId]);
      assert.ok(Number(restored.n) > 0, 'restore must regenerate real candidates before close');
      await items.close(finder, Number(found.itemId)); await assertAbsent(found.itemId);
      const [[state]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [found.itemId]); assert.equal(state.status, 'CLOSED');
    });
    await t.test('delete image invalidates embeddings and candidates; remaining images are reprocessed by real CLIP', async () => {
      const found = gallery.find(entry => entry !== gallery[0]) ?? queryItems[0];
      const identity = found.type === 'FOUND' ? finder : owner;
      const [[image]] = await query(pool, 'SELECT image_id,cloudinary_public_id FROM item_images WHERE item_id=? ORDER BY image_id LIMIT 1', [found.itemId]);
      await items.deleteImage(identity, Number(found.itemId), Number(image.image_id));
      const [[removed]] = await query(pool, 'SELECT COUNT(*) n FROM item_image_embeddings WHERE image_id=?', [image.image_id]); assert.equal(Number(removed.n), 0);
      assert.equal(assets.has(image.cloudinary_public_id), false);
      if (found.type === 'FOUND') await assertAbsent(found.itemId);
      await drain();
    });
    await t.test('Claim handover RETURNED removes the actual-image candidate without AI notifications or email dispatch', async () => {
      // A new FOUND item uses an original corpus image; no fixture vectors or
      // SQL lifecycle writes are used to manufacture this terminal transition.
      const created = await items.create(finder, { title: 'CLIP returned item', description: 'Isolated handover', type: 'FOUND',
        categoryId: Number(category.id), locationId: Number(location.id), eventDate: '2026-11-09' });
      const path = gallery[0].images[0];
      await items.uploadImages(finder, created.id, [{ buffer: await readFile(path), mimetype: extname(path).toLowerCase() === '.png' ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg' }]);
      await drain();
      const [[beforeReturn]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_candidates WHERE found_item_id=?', [created.id]);
      assert.ok(Number(beforeReturn.n) > 0, 'handover starts with real candidates');
      const claim = await claims.create(owner, created.id, { proofDescription: 'Non-sensitive isolated handover proof' });
      await claims.approve(finder, claim.id); await claims.complete(finder, claim.id);
      const [[state]] = await query(pool, 'SELECT status FROM items WHERE item_id=?', [created.id]); assert.equal(state.status, 'RETURNED');
      await assertAbsent(created.id);
      const [[afterReturn]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_candidates WHERE found_item_id=?', [created.id]); assert.equal(Number(afterReturn.n), 0);
      const [[notifications]] = await query(pool, 'SELECT COUNT(*) n FROM ai_visual_notification_outbox'); assert.equal(Number(notifications.n), 0);
      const [[sent]] = await query(pool, "SELECT COUNT(*) n FROM email_outbox WHERE status='SENT'"); assert.equal(Number(sent.n), 0);
    });
    rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    const report = { dataKind: synthetic ? 'synthetic-technical-only' : 'supplied-local-corpus',
      qualityVerdict: synthetic ? 'UNVERIFIED: synthetic drawings cannot establish real-photo retrieval accuracy' : 'MEASURED against supplied labels; label validity, photo provenance and product accuracy thresholds UNVERIFIED',
      storage: 'temporary-local-adapter; Cloudinary staging UNVERIFIED', model: { id: CLIP_MODEL_ID, revision: CLIP_MODEL_REVISION, dimensions: 512, dtype: 'q8', device: 'cpu' },
      runtime: { node: process.version, platform: process.platform },
      dataset: { itemCount: corpus.length, originalImageCount: corpus.reduce((n, item) => n + item.images.length, 0), exactDuplicateQueryGalleryPairs,
        warning: 'Exact duplicate photographs across query/gallery can inflate retrieval metrics; use distinct physical views for accuracy evaluation.' },
      inferenceScope: 'Encoder inference only, excluding image decode/storage and model initialization; existing filesystem model cache is used.',
      initializationMs: encoder.initializationMs, inference: measurements, memory: { rssBeforeBytes: rssBefore, sampledPeakRssBytes: rssPeak, rssAfterBytes: process.memoryUsage().rss, scope: 'test Node process; excludes browser and MySQL; 20ms sampling can miss peaks' },
      metrics, workerEvents: events.map(({ event, inferenceMs, code }) => ({ event, inferenceMs, code })) };
    await writeFile(resolve(artifacts, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ dataKind: report.dataKind, initializationMs: report.initializationMs, inferenceCount: measurements.length, sampledPeakRssBytes: rssPeak, atK: metrics.atK }));
  } finally {
    globalThis.fetch = originalFetch;
    try { await browser?.close(); } finally {
      try { await encoder?.dispose(); } finally {
        try { await http?.close(); } finally {
          await pool?.end();
          try { if (created) await setup.query(`DROP DATABASE \`${name}\``); } finally { await setup.end(); }
          assert.equal(dirname(workspace), resolve(tmpdir())); assert.ok(basename(workspace).startsWith('findit-ai-e2e-'));
          await rm(workspace, { recursive: true, force: true });
        }
      }
    }
  }
});
