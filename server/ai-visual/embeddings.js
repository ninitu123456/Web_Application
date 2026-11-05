import { CLIP_EMBEDDING_DIMENSIONS } from './config.js';

export function normalizeEmbedding(values) {
  if (!values || values.length !== CLIP_EMBEDDING_DIMENSIONS) throw new Error('AI_VISUAL_INVALID_EMBEDDING');
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error('AI_VISUAL_INVALID_EMBEDDING');
    sum += value * value;
  }
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) throw new Error('AI_VISUAL_INVALID_EMBEDDING');
  return Float32Array.from(values, (value) => value / norm);
}

export function encodeEmbedding(values) {
  const normalized = normalizeEmbedding(values);
  const bytes = Buffer.allocUnsafe(CLIP_EMBEDDING_DIMENSIONS * 4);
  normalized.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}

export function decodeEmbedding(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== CLIP_EMBEDDING_DIMENSIONS * 4) throw new Error('AI_VISUAL_INVALID_STORED_EMBEDDING');
  return Float32Array.from({ length: CLIP_EMBEDDING_DIMENSIONS }, (_, index) => bytes.readFloatLE(index * 4));
}

export function cosineSimilarity(left, right) {
  if (left.length !== CLIP_EMBEDDING_DIMENSIONS || right.length !== CLIP_EMBEDDING_DIMENSIONS) throw new Error('AI_VISUAL_INVALID_EMBEDDING');
  let dot = 0;
  for (let index = 0; index < CLIP_EMBEDDING_DIMENSIONS; index++) dot += left[index] * right[index];
  return Math.max(-1, Math.min(1, dot));
}

export function rankOppositeObjects(query, rows) {
  const byItem = new Map();
  for (const row of rows) {
    if (String(row.item_id) === String(query.itemId) || row.type === query.type) continue;
    const vector = decodeEmbedding(row.embedding_data);
    const score = cosineSimilarity(query.vector, vector);
    const key = String(row.item_id);
    if (!byItem.has(key) || score > byItem.get(key).score) byItem.set(key, { itemId: key, type: row.type, score });
  }
  return [...byItem.values()];
}
