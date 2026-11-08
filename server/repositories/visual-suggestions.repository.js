import { query } from '../config/db.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from '../ai-visual/config.js';
import { hiddenItemSql } from '../utils/item-visibility.js';

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
      const [[row]] = await execute(`SELECT i.item_id FROM items i JOIN users u ON u.user_id=i.user_id
        WHERE i.item_id = ? AND i.user_id = ? AND i.type = 'LOST' AND i.status IN ${ACTIVE}
          AND u.account_status='ACTIVE' AND ${hiddenItemSql()} = 0 LIMIT 1`, [itemId, ownerId]);
      return Boolean(row);
    },
    async processingState(itemId) {
      const [[row]] = await execute(`SELECT COUNT(im.image_id) AS images,
        SUM(j.status='FAILED') AS failed,
        SUM(j.job_id IS NULL OR j.status IN ('QUEUED','PROCESSING','CANCELLED') OR e.embedding_id IS NULL) AS pending
        FROM item_images im LEFT JOIN ai_visual_jobs j ON j.image_id=im.image_id AND j.model_id=? AND j.model_revision=?
        LEFT JOIN item_image_embeddings e ON e.image_id=im.image_id AND e.model_id=? AND e.model_revision=?
        WHERE im.item_id=?`, [CLIP_MODEL_ID, CLIP_MODEL_REVISION, CLIP_MODEL_ID, CLIP_MODEL_REVISION, itemId]);
      if (Number(row.failed)) return 'error';
      return Number(row.pending) ? 'processing' : 'ready';
    },
    async listForLostItem(itemId, limit = 3, ownerId) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 3) throw new Error('Visual suggestion limit must be between 1 and 3');
      const [rows] = await execute(`SELECT f.item_id AS item_id, f.title, f.description, f.color, f.event_date,
          c.name AS category_name, l.name AS location_name,
          (SELECT image_url FROM item_images thumb WHERE thumb.item_id = f.item_id ORDER BY thumb.image_id LIMIT 1) AS thumbnail_url,
          candidate.cosine_score
        FROM ai_visual_candidates candidate
        JOIN items lost ON lost.item_id = candidate.lost_item_id
        JOIN items f ON f.item_id = candidate.found_item_id
        JOIN users lu ON lu.user_id=lost.user_id AND lu.account_status='ACTIVE'
        JOIN users fu ON fu.user_id=f.user_id AND fu.account_status='ACTIVE'
        JOIN categories c ON c.category_id = f.category_id
        JOIN locations l ON l.location_id = f.location_id
        WHERE candidate.lost_item_id = ? AND lost.type = 'LOST' AND lost.status IN ${ACTIVE}
          ${ownerId === undefined ? '' : 'AND lost.user_id = ?'}
          AND f.type = 'FOUND' AND f.status IN ${ACTIVE}
          AND ${hiddenItemSql('lost.item_id')} = 0 AND ${hiddenItemSql('f.item_id')} = 0
          AND candidate.model_id = ? AND candidate.model_revision = ?
          AND candidate.cosine_score BETWEEN -1 AND 1
          AND NOT EXISTS (SELECT 1 FROM item_images im LEFT JOIN ai_visual_jobs j
            ON j.image_id=im.image_id AND j.model_id=candidate.model_id AND j.model_revision=candidate.model_revision
            WHERE im.item_id IN (lost.item_id,f.item_id) AND (j.job_id IS NULL OR j.status<>'COMPLETED'))
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
      [itemId, ...(ownerId === undefined ? [] : [ownerId]), CLIP_MODEL_ID, CLIP_MODEL_REVISION, limit]);
      return rows;
    }
  };
}
