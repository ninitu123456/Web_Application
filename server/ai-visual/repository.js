import { transaction, query, databaseTimeout } from '../config/db.js';
import { randomUUID } from 'node:crypto';
import { cosineSimilarity, decodeEmbedding } from './embeddings.js';
import { hiddenItemSql } from '../utils/item-visibility.js';
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from './config.js';

const ACTIVE = "('OPEN','CLAIM_PENDING','CLAIMED')";

export function createAiVisualRepository(pool) {
  return {
    async claimNext(maxAttempts) {
      const leaseToken = randomUUID();
      return transaction(pool, async (connection) => {
        await connection.query({ sql: `UPDATE ai_visual_jobs SET status = IF(attempts >= ?, 'FAILED', 'QUEUED'), locked_until = NULL, lease_token = NULL, available_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE status = 'PROCESSING' AND locked_until <= UTC_TIMESTAMP()`, timeout: databaseTimeout }, [maxAttempts]);
        // Claim locks jobs only. Item mutations and embedding writes lock Item
        // before Job; a claiming worker must not wait for Item while holding Job.
        const [rows] = await connection.query({ sql: `SELECT j.job_id, j.image_id, j.model_id, j.model_revision, j.attempts
          FROM ai_visual_jobs j
          WHERE j.status = 'QUEUED' AND j.available_at <= UTC_TIMESTAMP()
          AND j.model_id=? AND j.model_revision=?
          ORDER BY j.available_at, j.job_id LIMIT 1 FOR UPDATE SKIP LOCKED`, timeout: databaseTimeout }, [CLIP_MODEL_ID, CLIP_MODEL_REVISION]);
        if (!rows.length) return undefined;
        const job = rows[0];
        const [[image]] = await connection.query({ sql: `SELECT im.item_id, im.cloudinary_public_id, i.type, i.status AS item_status, ${hiddenItemSql()} AS is_hidden
          FROM item_images im JOIN items i ON i.item_id=im.item_id WHERE im.image_id=?`, timeout: databaseTimeout }, [job.image_id]);
        await connection.query({ sql: `UPDATE ai_visual_jobs SET status = 'PROCESSING', attempts = attempts + 1,
          locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 MINUTE), lease_token = ?, last_error_code = NULL, updated_at = UTC_TIMESTAMP()
          WHERE job_id = ?`, timeout: databaseTimeout }, [leaseToken, job.job_id]);
        return { ...job, ...image, lease_token: leaseToken, attempts: Number(job.attempts) + 1 };
      });
    },
    async renewLease(job) {
      if (!job.lease_token) return false;
      const [result] = await query(pool, `UPDATE ai_visual_jobs SET locked_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 MINUTE), updated_at=UTC_TIMESTAMP()
        WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND locked_until>UTC_TIMESTAMP()`, [job.job_id, job.lease_token]);
      return result.affectedRows === 1;
    },
    async existingEmbedding(job) {
      // Image IDs/public IDs are immutable; replacing a photo creates a new ID.
      // A matching retry after inference must not download or infer again.
      const [[row]] = await query(pool, `SELECT e.dimensions, e.embedding_data
        FROM ai_visual_jobs j JOIN item_images im ON im.image_id=j.image_id
        JOIN item_image_embeddings e ON e.image_id=j.image_id AND e.model_id=j.model_id AND e.model_revision=j.model_revision
        WHERE j.job_id=? AND j.status='PROCESSING' AND j.lease_token=? AND j.locked_until>UTC_TIMESTAMP()
        AND im.cloudinary_public_id=?`, [job.job_id, job.lease_token, job.cloudinary_public_id]);
      if (!row || Number(row.dimensions) !== 512) return undefined;
      try {
        const vector = decodeEmbedding(row.embedding_data);
        const norm = vector.reduce((sum, value) => sum + value * value, 0);
        if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.001) return undefined;
        return vector;
      } catch { return undefined; }
    },
    async saveEmbedding(job, embeddingData) {
      return transaction(pool, async (connection) => {
        await connection.query({ sql: 'SELECT item_id FROM items WHERE item_id=? FOR UPDATE', timeout: databaseTimeout }, [job.item_id]);
        const [[context]] = await connection.query({ sql: `SELECT i.item_id, i.type, i.status, ${hiddenItemSql()} AS is_hidden FROM ai_visual_jobs j
          JOIN item_images im ON im.image_id = j.image_id JOIN items i ON i.item_id = im.item_id
          WHERE j.job_id = ? AND j.status = 'PROCESSING' AND j.lease_token=? AND j.locked_until>UTC_TIMESTAMP() FOR UPDATE`, timeout: databaseTimeout }, [job.job_id, job.lease_token]);
        if (!context) return undefined;
        if (Number(context.is_hidden) || !['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(context.status)) {
          await connection.query({ sql: "UPDATE ai_visual_jobs SET status='CANCELLED', locked_until=NULL, lease_token=NULL, updated_at=UTC_TIMESTAMP() WHERE job_id=? AND lease_token=?", timeout: databaseTimeout }, [job.job_id, job.lease_token]);
          return undefined;
        }
        await connection.query({ sql: `INSERT INTO item_image_embeddings (image_id, model_id, model_revision, dimensions, embedding_data, created_at)
          VALUES (?, ?, ?, 512, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE dimensions=VALUES(dimensions), embedding_data=VALUES(embedding_data), created_at=UTC_TIMESTAMP()`, timeout: databaseTimeout },
        [job.image_id, job.model_id, job.model_revision, embeddingData]);
        return { itemId: String(context.item_id), type: context.type };
      });
    },
    async finish(job, itemId) {
      return transaction(pool, async (connection) => {
        await connection.query({ sql: 'SELECT item_id FROM items WHERE item_id=? FOR UPDATE', timeout: databaseTimeout }, [itemId]);
        const [[item]] = await connection.query({ sql: `SELECT i.status, ${hiddenItemSql()} AS is_hidden FROM ai_visual_jobs j
          JOIN item_images im ON im.image_id=j.image_id JOIN items i ON i.item_id=im.item_id
          WHERE j.job_id=? AND j.status='PROCESSING' AND j.lease_token=? AND j.locked_until>UTC_TIMESTAMP() FOR UPDATE`, timeout: databaseTimeout }, [job.job_id, job.lease_token]);
        if (!item) return false;
        if (Number(item.is_hidden) || !['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(item.status)) {
          await connection.query({ sql: "UPDATE ai_visual_jobs SET status='CANCELLED', locked_until=NULL, lease_token=NULL, updated_at=UTC_TIMESTAMP() WHERE job_id=? AND lease_token=?", timeout: databaseTimeout }, [job.job_id, job.lease_token]);
          await connection.query({ sql: 'DELETE FROM ai_visual_candidates WHERE lost_item_id=? OR found_item_id=?', timeout: databaseTimeout }, [itemId, itemId]);
          return false;
        }
        await connection.query({ sql: "UPDATE ai_visual_jobs SET status='COMPLETED', locked_until=NULL, lease_token=NULL, last_error_code=NULL, updated_at=UTC_TIMESTAMP() WHERE job_id=? AND lease_token=?", timeout: databaseTimeout }, [job.job_id, job.lease_token]);
        return true;
      });
    },
    async oppositeEmbeddingPage(itemId, type, modelId, modelRevision, afterImageId, limit = 250) {
      const [rows] = await query(pool, `SELECT im.image_id, im.item_id, i.type, e.embedding_data FROM items i
        JOIN item_images im ON im.item_id=i.item_id
        JOIN item_image_embeddings e ON e.image_id=im.image_id AND e.model_id=? AND e.model_revision=?
        WHERE i.type=? AND i.status IN ${ACTIVE} AND i.item_id<>? AND im.image_id>?
          AND ${hiddenItemSql()} = 0
        ORDER BY im.image_id LIMIT ?`, [modelId, modelRevision, type === 'LOST' ? 'FOUND' : 'LOST', itemId, afterImageId, limit]);
      return rows;
    },
    async upsertCandidates(job, itemId, type, modelId, modelRevision, candidates) {
      if (!candidates.length) return true;
      return transaction(pool, async (connection) => {
        // Pair writes share Item locks with deletion and all terminal transitions.
        // Lock in numeric order before Job to avoid opposing workers inverting it.
        const ids = [...new Set([String(itemId), ...candidates.map((candidate) => String(candidate.itemId))])]
          .sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);
        const items = new Map();
        for (const id of ids) {
          const [[item]] = await connection.query({ sql: 'SELECT item_id, type, status FROM items WHERE item_id=? FOR UPDATE', timeout: databaseTimeout }, [id]);
          if (item) items.set(String(item.item_id), item);
        }
        // Open the visibility read view only after every contended Item lock.
        // A page read before an admin hide must never recreate a hidden pair.
        const [visibility] = await connection.query({ sql: `SELECT i.item_id, ${hiddenItemSql()} AS is_hidden
          FROM items i WHERE i.item_id IN (${ids.map(() => '?').join(',')})`, timeout: databaseTimeout }, ids);
        for (const row of visibility) if (items.has(String(row.item_id))) items.get(String(row.item_id)).is_hidden = row.is_hidden;
        const [[lease]] = await connection.query({ sql: `SELECT job_id FROM ai_visual_jobs
          WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND locked_until>UTC_TIMESTAMP()
          AND image_id=? AND model_id=? AND model_revision=? FOR UPDATE`, timeout: databaseTimeout }, [job.job_id, job.lease_token, job.image_id, modelId, modelRevision]);
        if (!lease) return false;
        const own = items.get(String(itemId));
        if (!own || Number(own.is_hidden) || own.type !== type || !['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(own.status)) return false;
        // Read after all locks using a current read, never the earlier page
        // snapshot. At most five vectors per item; recomputing all pairs is cheap.
        const [embeddings] = await connection.query({ sql: `SELECT im.item_id, e.embedding_data
          FROM item_images im JOIN item_image_embeddings e ON e.image_id=im.image_id
          WHERE im.item_id IN (${ids.map(() => '?').join(',')}) AND e.model_id=? AND e.model_revision=?
          FOR SHARE`, timeout: databaseTimeout }, [...ids, modelId, modelRevision]);
        const vectors = new Map();
        for (const row of embeddings) {
          const key = String(row.item_id);
          if (!vectors.has(key)) vectors.set(key, []);
          vectors.get(key).push(decodeEmbedding(row.embedding_data));
        }
        for (const candidate of candidates) {
          const lostId = type === 'LOST' ? itemId : candidate.itemId;
          const foundId = type === 'FOUND' ? itemId : candidate.itemId;
          if (String(lostId) === String(foundId)) continue;
          const opposite = items.get(String(candidate.itemId));
          if (!opposite || Number(opposite.is_hidden) || opposite.type === type || !['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(opposite.status)) continue;
          const left = vectors.get(String(itemId)) ?? [], right = vectors.get(String(candidate.itemId)) ?? [];
          if (!left.length || !right.length) continue;
          let score = -1;
          for (const a of left) for (const b of right) score = Math.max(score, cosineSimilarity(a, b));
          await connection.query({ sql: `INSERT INTO ai_visual_candidates
            (lost_item_id, found_item_id, model_id, model_revision, cosine_score, updated_at)
            VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE cosine_score=VALUES(cosine_score), updated_at=UTC_TIMESTAMP()`, timeout: databaseTimeout },
          [lostId, foundId, modelId, modelRevision, score]);
        }
        return true;
      });
    },
    async cancel(job) {
      await query(pool, "UPDATE ai_visual_jobs SET status='CANCELLED', locked_until=NULL, lease_token=NULL, updated_at=UTC_TIMESTAMP() WHERE job_id=? AND status='PROCESSING' AND lease_token=?", [job.job_id, job.lease_token]);
    },
    async fail(job, error, maxAttempts) {
      const code = typeof error?.message === 'string' && /^AI_VISUAL_[A-Z0-9_]+$/.test(error.message) ? error.message : 'AI_VISUAL_PROCESSING_FAILED';
      const backoffSeconds = Math.min(300, 2 ** Math.min(job.attempts, 8));
      await query(pool, `UPDATE ai_visual_jobs SET status=IF(attempts >= ?, 'FAILED', 'QUEUED'),
        available_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), locked_until=NULL, lease_token=NULL, last_error_code=?, updated_at=UTC_TIMESTAMP()
        WHERE job_id=? AND status='PROCESSING' AND lease_token=?`, [maxAttempts, backoffSeconds, code, job.job_id, job.lease_token]);
      return code;
    },
  };
}
