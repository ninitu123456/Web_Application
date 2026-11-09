import { mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { env as processEnv } from 'node:process';
import { performance } from 'node:perf_hooks';
import { CLIP_MODEL_DTYPE, CLIP_MODEL_ID, CLIP_MODEL_REVISION } from './config.js';
import { normalizeEmbedding } from './embeddings.js';

// Bound encoded input, inspect headers, then decode with libvips' pixel limit.
// RawImage.read uses the decoder defaults, so do not pass compressed input to it.
export async function decodeLocalImage(filePath) {
  const chunks = [];
  let size = 0;
  for await (const chunk of createReadStream(filePath)) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new Error('AI_VISUAL_IMAGE_SIZE_LIMIT');
    chunks.push(chunk);
  }
  if (!size) throw new Error('AI_VISUAL_EMPTY_IMAGE');
  const input = Buffer.concat(chunks);
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp) throw new Error('AI_VISUAL_UNSUPPORTED_IMAGE_TYPE');
  const { default: sharp } = await import('sharp');
  const decoder = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' });
  try {
    const metadata = await decoder.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('AI_VISUAL_UNSUPPORTED_IMAGE_TYPE');
    if ((metadata.pages ?? 1) !== 1) throw new Error('AI_VISUAL_MULTIPAGE_IMAGE');
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height) ||
        metadata.width < 1 || metadata.height < 1 || metadata.width * metadata.height > 40_000_000) {
      throw new Error('AI_VISUAL_IMAGE_PIXEL_LIMIT');
    }
    return await decoder.rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb').removeAlpha().raw().timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error.message.startsWith('AI_VISUAL_')) throw error;
    throw new Error(/pixel limit/i.test(error.message) ? 'AI_VISUAL_IMAGE_PIXEL_LIMIT' : 'AI_VISUAL_IMAGE_DECODE_FAILED');
  } finally {
    decoder.destroy();
  }
}

export async function createClipEncoder({ cacheDir = processEnv.AI_VISUAL_MATCHING_CACHE_DIR } = {}) {
  const targetCache = resolve(cacheDir || `${processEnv.LOCALAPPDATA || processEnv.TMPDIR || '.'}/FindItVisualMatching/model-cache`);
  await mkdir(targetCache, { recursive: true });
  const { env, pipeline, RawImage } = await import('@huggingface/transformers');
  env.cacheDir = targetCache;
  env.useFSCache = true;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  const started = performance.now();
  const extractor = await pipeline('image-feature-extraction', CLIP_MODEL_ID, {
    revision: CLIP_MODEL_REVISION,
    dtype: CLIP_MODEL_DTYPE,
    device: 'cpu',
    // Serial jobs alone do not limit ONNX's native thread pool. Avoid creating
    // a pool for every host core on a small Railway CPU allocation.
    session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 }
  });
  const initializationMs = performance.now() - started;
  return {
    initializationMs,
    async dispose() { await extractor.dispose(); },
    async embedFile(filePath) {
      const { data, info } = await decodeLocalImage(filePath);
      const image = new RawImage(data, info.width, info.height, info.channels);
      const started = performance.now();
      const tensor = await extractor(image);
      return { vector: normalizeEmbedding(Array.from(tensor.data)), inferenceMs: performance.now() - started };
    }
  };
}
