import { query } from '../config/db.js';

// No migration, seed or data access during preflight. Check the shared AI
// schema before enabling writes or downloading the model.
export async function assertAiVisualSchema(pool) {
  try {
    await query(pool, 'SELECT j.lease_token,e.embedding_data,c.cosine_score FROM ai_visual_jobs j JOIN item_image_embeddings e ON e.image_id=j.image_id JOIN ai_visual_candidates c ON c.model_id=j.model_id LIMIT 0');
    const [[state]] = await query(pool, 'SELECT revision FROM ai_visual_catalog_state WHERE state_id=1');
    if (!state) throw new Error('Missing catalog state seed');
  } catch {
    throw Object.assign(new Error('AI visual schema is incomplete; apply and verify the migration manifest before enabling AI'), { code: 'INVALID_CONFIG' });
  }
}
