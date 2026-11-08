import { transaction, query, databaseTimeout } from '../config/db.js';
import { hiddenItemSql } from '../utils/item-visibility.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from './config.js';

// Each item shares the image mutation lock. Unique image/model/revision keys
// make repeated and concurrent runs safe; never steal an active worker lease.
export async function backfillAiVisual(pool, { retryFailed = false, rebuild = false, signal } = {}) {
  let after = '0', scannedItems = 0, changedJobs = 0;
  while (!signal?.aborted) {
    const [page] = await query(pool, 'SELECT item_id FROM items WHERE item_id > ? ORDER BY item_id LIMIT 100', [after]);
    if (!page.length) break;
    for (const row of page) {
      if (signal?.aborted) break;
      changedJobs += await transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        await run('SELECT item_id FROM items WHERE item_id=? FOR UPDATE', [row.item_id]);
        const [images] = await run(`SELECT im.image_id FROM item_images im JOIN items i ON i.item_id=im.item_id
          JOIN users u ON u.user_id=i.user_id WHERE i.item_id=? AND i.status IN ('OPEN','CLAIM_PENDING','CLAIMED')
          AND u.account_status='ACTIVE' AND ${hiddenItemSql()}=0
          AND REGEXP_LIKE(im.cloudinary_public_id, '^findit/items/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'c')`, [row.item_id]);
        let changed = 0;
        for (const image of images) {
          const [insert] = await run(`INSERT IGNORE INTO ai_visual_jobs
            (image_id,model_id,model_revision,status,attempts,available_at,created_at,updated_at)
            VALUES(?,?,?,'QUEUED',0,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [image.image_id, CLIP_MODEL_ID, CLIP_MODEL_REVISION]);
          changed += insert.affectedRows;
          const [update] = await run(`UPDATE ai_visual_jobs j LEFT JOIN item_image_embeddings e
            ON e.image_id=j.image_id AND e.model_id=j.model_id AND e.model_revision=j.model_revision
            SET j.status='QUEUED',j.attempts=0,j.available_at=UTC_TIMESTAMP(),j.locked_until=NULL,j.lease_token=NULL,j.last_error_code=NULL,j.updated_at=UTC_TIMESTAMP()
            WHERE j.image_id=? AND j.model_id=? AND j.model_revision=?
            AND (j.status='CANCELLED' OR (j.status='COMPLETED' AND (e.embedding_id IS NULL OR ?)) OR (? AND j.status='FAILED'))`,
          [image.image_id, CLIP_MODEL_ID, CLIP_MODEL_REVISION, rebuild, retryFailed]);
          changed += update.affectedRows;
        }
        return changed;
      });
      scannedItems++;
      after = String(row.item_id);
    }
    if (page.length < 100) break;
  }
  return { scannedItems, changedJobs, interrupted: Boolean(signal?.aborted) };
}
