import { query } from '../config/db.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from '../ai-visual/config.js';

const ACTIVE = "('OPEN','CLAIM_PENDING','CLAIMED')";
export function isMissingAiVisualTable(error) {
  if (error?.code !== 'ER_NO_SUCH_TABLE') return false;
  const missing = /Table '([^']+)' doesn't exist/i.exec(error.sqlMessage ?? error.message ?? '');
  const table = missing?.[1].split('.').at(-1);
  return ['ai_visual_candidates', 'item_image_embeddings', 'ai_visual_jobs'].includes(table);
}

export function createVisualSuggestionsRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  return {
    async isEligibleOwnedLostItem(itemId, ownerId) {
      const [[row]] = await execute(`SELECT item_id FROM items
        WHERE item_id = ? AND user_id = ? AND type = 'LOST' AND status IN ${ACTIVE} LIMIT 1`, [itemId, ownerId]);
      return Boolean(row);
    },
    async listForLostItem(itemId, limit = 3) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 3) throw new Error('Visual suggestion limit must be between 1 and 3');
      const [rows] = await execute(`SELECT f.item_id AS item_id, f.title, f.description, f.color, f.event_date,
          c.name AS category_name, l.name AS location_name,
          (SELECT image_url FROM item_images thumb WHERE thumb.item_id = f.item_id ORDER BY thumb.image_id LIMIT 1) AS thumbnail_url,
          candidate.cosine_score
        FROM ai_visual_candidates candidate
        JOIN items lost ON lost.item_id = candidate.lost_item_id
        JOIN items f ON f.item_id = candidate.found_item_id
        JOIN categories c ON c.category_id = f.category_id
        JOIN locations l ON l.location_id = f.location_id
        WHERE candidate.lost_item_id = ? AND lost.type = 'LOST' AND lost.status IN ${ACTIVE}
          AND f.type = 'FOUND' AND f.status IN ${ACTIVE}
          AND candidate.model_id = ? AND candidate.model_revision = ?
          AND candidate.cosine_score BETWEEN -1 AND 1
          AND EXISTS (SELECT 1 FROM item_images li JOIN item_image_embeddings le ON le.image_id = li.image_id
            WHERE li.item_id = lost.item_id AND le.model_id = candidate.model_id AND le.model_revision = candidate.model_revision)
          AND EXISTS (SELECT 1 FROM item_images fi JOIN item_image_embeddings fe ON fe.image_id = fi.image_id
            WHERE fi.item_id = f.item_id AND fe.model_id = candidate.model_id AND fe.model_revision = candidate.model_revision)
          AND NOT EXISTS (SELECT 1 FROM item_images li LEFT JOIN item_image_embeddings le
            ON le.image_id = li.image_id AND le.model_id = candidate.model_id AND le.model_revision = candidate.model_revision
            WHERE li.item_id = lost.item_id AND le.embedding_id IS NULL)
          AND NOT EXISTS (SELECT 1 FROM item_images fi LEFT JOIN item_image_embeddings fe
            ON fe.image_id = fi.image_id AND fe.model_id = candidate.model_id AND fe.model_revision = candidate.model_revision
            WHERE fi.item_id = f.item_id AND fe.embedding_id IS NULL)
        ORDER BY candidate.cosine_score DESC, candidate.found_item_id ASC LIMIT ?`,
      [itemId, CLIP_MODEL_ID, CLIP_MODEL_REVISION, limit]);
      return rows;
    }
  };
}
