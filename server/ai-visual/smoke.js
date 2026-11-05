import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from './config.js';
import { cosineSimilarity } from './embeddings.js';
import { createClipEncoder } from './clip-encoder.js';

const [lostPath, foundPath, ...extra] = process.argv.slice(2);
if (!lostPath || !foundPath || extra.length) throw new Error('Usage: npm run ai-visual:smoke -- <local-LOST-image> <local-FOUND-image>');
const paths = [resolve(lostPath), resolve(foundPath)];
for (const file of paths) {
  const info = await stat(file);
  if (!info.isFile() || info.size > 5 * 1024 * 1024) throw new Error('Each local fixture must be a file no larger than 5 MiB');
}
const rssBefore = process.memoryUsage().rss;
const encoder = await createClipEncoder();
const lost = await encoder.embedFile(paths[0]);
const found = await encoder.embedFile(paths[1]);
console.log(JSON.stringify({
  model: { id: CLIP_MODEL_ID, revision: CLIP_MODEL_REVISION, device: 'cpu', dimensions: lost.vector.length },
  initializationMs: encoder.initializationMs,
  inferenceMs: { lost: lost.inferenceMs, found: found.inferenceMs },
  cosineSimilarity: cosineSimilarity(lost.vector, found.vector),
  interpretation: 'Cosine similarity is a ranking score, not a match probability.',
  rssBeforeBytes: rssBefore,
  rssAfterBytes: process.memoryUsage().rss
}, null, 2));
