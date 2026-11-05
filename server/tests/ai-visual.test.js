import test from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { readAiVisualConfig } from '../ai-visual/config.js';
import { decodeEmbedding, encodeEmbedding, normalizeEmbedding, cosineSimilarity, rankOppositeObjects } from '../ai-visual/embeddings.js';
import { createCloudinaryImageSource } from '../ai-visual/cloudinary-image-source.js';
import { createAiVisualWorker } from '../ai-visual/worker.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { decodeLocalImage } from '../ai-visual/clip-encoder.js';

const vector = (index) => Float32Array.from({ length: 512 }, (_, i) => i === index ? 1 : 0);

test('AI visual configuration is disabled by default and restricted to development/test', () => {
  assert.equal(readAiVisualConfig({}).enabled, false);
  const isolated = { NODE_ENV: 'test', AI_VISUAL_MATCHING_ENABLED: 'true', DB_HOST: '127.0.0.1', DB_PORT: '45000', FINDIT_ISOLATED_DATADIR: join(tmpdir(), 'findit-mysql-test', 'data'), AI_VISUAL_MATCHING_CLOUD_NAME: 'findit-dev', CLOUDINARY_CLOUD_NAME: 'findit-dev' };
  assert.equal(readAiVisualConfig(isolated).enabled, true);
  assert.throws(() => readAiVisualConfig({ NODE_ENV: 'development', AI_VISUAL_MATCHING_ENABLED: 'true' }), /isolated local MySQL/);
  assert.throws(() => readAiVisualConfig({ ...isolated, CLOUDINARY_CLOUD_NAME: 'prod-cloud' }), /development Cloudinary/);
  assert.throws(() => readAiVisualConfig({ NODE_ENV: 'production', AI_VISUAL_MATCHING_ENABLED: 'true' }), /development or test/);
  assert.throws(() => readAiVisualConfig({ AI_VISUAL_MATCHING_ENABLED: 'yes' }), /true or false/);
  assert.throws(() => readAiVisualConfig({ AI_VISUAL_MATCHING_POLL_MS: '1' }), /POLL_MS/);
});

test('embedding storage round-trips normalized 512-float vectors and cosine is bounded', () => {
  const normalized = normalizeEmbedding([3, ...Array(511).fill(0)]);
  assert.equal(normalized[0], 1);
  const encoded = encodeEmbedding([3, ...Array(511).fill(0)]);
  assert.equal(encoded.length, 2048);
  assert.equal(cosineSimilarity(decodeEmbedding(encoded), vector(0)), 1);
  assert.throws(() => normalizeEmbedding([0, ...Array(511).fill(0)]), /INVALID_EMBEDDING/);
  assert.throws(() => normalizeEmbedding([1, 2]), /INVALID_EMBEDDING/);
});

test('ranking aggregates multiple photos by maximum and filters same-type/self rows', () => {
  const rows = [
    { item_id: '10', type: 'LOST', embedding_data: encodeEmbedding(vector(0)) },
    { item_id: '11', type: 'FOUND', embedding_data: encodeEmbedding(vector(1)) },
    { item_id: '11', type: 'FOUND', embedding_data: encodeEmbedding(vector(0)) },
    { item_id: '12', type: 'FOUND', embedding_data: encodeEmbedding(vector(2)) }
  ];
  assert.deepEqual(rankOppositeObjects({ itemId: '10', type: 'LOST', vector: vector(0) }, rows), [
    { itemId: '11', type: 'FOUND', score: 1 }, { itemId: '12', type: 'FOUND', score: 0 }
  ]);
});

test('worker retries failed inference, cleans its local image and never calls notifications or Claims', async () => {
  let claims = 0, failures = 0, cleaned = 0, modelCalls = 0;
  const events = [];
  const repository = {
    async claimNext() { claims++; return claims === 1 ? { job_id: '7', image_id: '8', item_id: '9', type: 'LOST', item_status: 'OPEN', cloudinary_public_id: 'findit/items/id', model_id: 'Xenova/clip-vit-base-patch32', model_revision: 'pinned', attempts: 1 } : undefined; },
    async fail(job, error) { failures++; assert.equal(job.job_id, '7'); assert.equal(error.message, 'inference unavailable'); return 'AI_VISUAL_PROCESSING_FAILED'; },
    async cancel() { assert.fail('active test item must not be cancelled'); },
    async saveEmbedding() { assert.fail('failed inference has no embedding'); },
    async upsertCandidates() { assert.fail('failed inference has no candidate result'); }
  };
  const worker = createAiVisualWorker({ repository, config: { enabled: true, maxAttempts: 3, pollMs: 250 },
    imageSource: { async download() { return { filePath: 'local-fixture.jpg', async cleanup() { cleaned++; } }; } },
    encoder: { async embedFile() { modelCalls++; throw new Error('inference unavailable'); } },
    onEvent(event) { events.push(event); }
  });
  assert.equal(await worker.processNext(), true);
  assert.equal(failures, 1); assert.equal(cleaned, 1); assert.equal(modelCalls, 1);
  assert.equal(events.at(-1).event, 'job_failed');
  assert.equal(await worker.processNext(), false);
  assert.equal(claims, 2);
});

test('worker recovers from transient claim failures with backoff until shutdown', async () => {
  const controller = new AbortController();
  let claims = 0;
  const events = [];
  const worker = createAiVisualWorker({
    repository: { async claimNext() { if (++claims === 1) throw Object.assign(new Error('temporary DB outage'), { code: 'ECONNRESET' }); controller.abort(); return undefined; } },
    config: { enabled: true, maxAttempts: 3, pollMs: 250 },
    imageSource: { async download() { assert.fail('no image should be downloaded'); } },
    encoder: { async embedFile() { assert.fail('inference should not run'); } },
    onEvent(event) { events.push(event); }
  });
  await worker.run(controller.signal);
  assert.equal(claims, 2);
  assert.equal(events[0].event, 'worker_poll_failed');
  assert.equal(events[0].code, 'ECONNRESET');
});

test('disabled AI cleanup skips absent tables but removes rows from whichever AI tables exist', async () => {
  const tables = ['ai_visual_candidates', 'ai_visual_jobs', 'item_image_embeddings'];
  // Exercise no tables, every partial schema, and all tables, at both scopes.
  for (let mask = 0; mask < 8; mask++) {
    for (const imageId of [undefined, '41']) {
      const available = tables.filter((_, index) => mask & (1 << index));
      const statements = [];
      const repository = createItemRepository({}, async (sql, values = []) => {
        statements.push({ sql, values });
        if (sql.includes('information_schema.TABLES')) return [available.map((table_name) => ({ table_name }))];
        return [{ affectedRows: 1 }];
      });
      await repository.deleteAiVisualDataIfPresent('31', imageId);
      assert.match(statements[0].sql, /TABLE_SCHEMA=DATABASE\(\)/);
      const expected = [];
      if (available.includes('ai_visual_candidates')) expected.push({ sql: 'DELETE FROM ai_visual_candidates WHERE lost_item_id=? OR found_item_id=?', values: ['31', '31'] });
      if (available.includes('ai_visual_jobs')) expected.push(imageId === undefined
        ? { sql: 'DELETE j FROM ai_visual_jobs j JOIN item_images im ON im.image_id=j.image_id WHERE im.item_id=?', values: ['31'] }
        : { sql: 'DELETE FROM ai_visual_jobs WHERE image_id=?', values: ['41'] });
      if (available.includes('item_image_embeddings')) expected.push(imageId === undefined
        ? { sql: 'DELETE e FROM item_image_embeddings e JOIN item_images im ON im.image_id=e.image_id WHERE im.item_id=?', values: ['31'] }
        : { sql: 'DELETE FROM item_image_embeddings WHERE image_id=?', values: ['41'] });
      assert.deepEqual(statements.slice(1), expected, `tables=${available.join(',')}; image=${imageId}`);
    }
  }
});

async function withLocalImage(buffer, run) {
  const directory = await mkdtemp(join(tmpdir(), 'findit-ai-decode-'));
  try {
    const file = join(directory, 'fixture.image');
    await writeFile(file, buffer);
    await run(file);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('findit-ai-decode-'));
    await rm(directory, { recursive: true, force: true });
  }
}

test('local decoder detects actual JPEG/PNG/WebP content and bounds RGB output before CLIP', async () => {
  for (const format of ['jpeg', 'png', 'webp']) {
    const image = await sharp({ create: { width: 2048, height: 1024, channels: 3, background: '#336699' } }).toFormat(format).toBuffer();
    await withLocalImage(image, async (file) => {
      const { data, info } = await decodeLocalImage(file);
      assert.equal(info.width, 1024);
      assert.equal(info.height, 512);
      assert.equal(info.channels, 3);
      assert.equal(data.length, 1024 * 512 * 3);
    });
  }
});

test('local decoder rejects oversized PNG headers before full pixel decoding', async () => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).png().toBuffer();
  // A valid IHDR CRC ensures rejection tests dimensions, not a corrupt header.
  image.writeUInt32BE(10000, 16);
  image.writeUInt32BE(10000, 20);
  let crc = 0xffffffff;
  for (const byte of image.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  image.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  await withLocalImage(image, async (file) => {
    await assert.rejects(() => decodeLocalImage(file), /AI_VISUAL_IMAGE_PIXEL_LIMIT/);
  });
});

test('local decoder rejects empty, malformed, truncated, unsupported and byte-oversized files', async () => {
  const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#336699' } }).jpeg().toBuffer();
  const gif = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).gif().toBuffer();
  for (const [image, expected] of [
    [Buffer.alloc(0), /EMPTY_IMAGE/],
    [Buffer.from([0xff, 0xd8, 0xff]), /DECODE_FAILED/],
    [jpeg.subarray(0, jpeg.length - 20), /DECODE_FAILED/],
    [gif, /UNSUPPORTED_IMAGE_TYPE/],
    [Buffer.alloc(5 * 1024 * 1024 + 1), /IMAGE_SIZE_LIMIT/]
  ]) {
    await withLocalImage(image, async (file) => { await assert.rejects(() => decodeLocalImage(file), expected); });
  }
});

test('decoder failure does not leave a downloaded temporary image after worker cleanup', async () => {
  let downloaded;
  const source = createCloudinaryImageSource({ cloudName: 'findit-test', fetchImpl: async () =>
    new Response(Buffer.from('not an image'), { headers: { 'content-type': 'image/jpeg' } }) });
  const worker = createAiVisualWorker({
    config: { enabled: true, maxAttempts: 3, pollMs: 250 },
    repository: {
      async claimNext() { return { job_id: '7', item_id: '9', type: 'LOST', item_status: 'OPEN', cloudinary_public_id: 'findit/items/123e4567-e89b-42d3-a456-426614174000' }; },
      async fail() { return 'AI_VISUAL_IMAGE_DECODE_FAILED'; },
      async saveEmbedding() { assert.fail('malformed input must never produce an embedding'); }
    },
    imageSource: { async download(id) { downloaded = await source.download(id); return downloaded; } },
    encoder: { embedFile: decodeLocalImage }
  });
  try {
    await worker.processNext();
    assert.ok(downloaded);
    await assert.rejects(() => access(downloaded.filePath), (error) => error.code === 'ENOENT');
  } finally { await downloaded?.cleanup(); }
});

test('Cloudinary source rejects arbitrary IDs before network access and bounds trusted downloads', async () => {
  let requested;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff])); controller.close(); } });
  const source = createCloudinaryImageSource({ cloudName: 'findit-test', fetchImpl: async (url, options) => {
    requested = { url, options };
    return new Response(body, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '3' } });
  } });
  await assert.rejects(() => source.download('https://evil.invalid/image.jpg'), /UNTRUSTED_IMAGE_SOURCE/);
  const file = await source.download('findit/items/123e4567-e89b-42d3-a456-426614174000');
  try {
    assert.match(requested.url, /^https:\/\/res\.cloudinary\.com\/findit-test\/image\/upload\/c_limit,w_1024,h_1024,f_jpg\//);
    assert.equal(requested.options.redirect, 'error');
    assert.ok(requested.options.signal);
  } finally { await file.cleanup(); }
});
