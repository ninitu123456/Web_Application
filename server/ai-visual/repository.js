import { transaction, query, databaseTimeout } from '../config/db.js';
import { randomUUID } from 'node:crypto';

const ACTIVE = "('OPEN','CLAIM_PENDING','CLAIMED')";

export function createAiVisualRepository(pool) {
  return {
    async claimNext(maxAttempts) {
      const leaseToken = randomUUID();
      return transaction(pool, async (connection) => {
        await connection.query({ sql: `UPDATE ai_visual_jobs SET status = IF(attempts >= ?, 'FAILED', 'QUEUED'), locked_until = NULL, lease_token = NULL, available_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE status = 'PROCESSING' AND locked_until <= UTC_TIMESTAMP()`, timeout: databaseTimeout }, [maxAttempts]);
        const [rows] = await connection.query({ sql: `SELECT j.job_id, j.image_id, j.model_id, j.model_revision, j.attempts,
          im.item_id, im.cloudinary_public_id, i.type, i.status AS item_status
          FROM ai_visual_jobs j JOIN item_images im ON im.image_id = j.image_id JOIN items i ON i.item_id = im.item_id
          WHERE j.status = 'QUEUED' AND j.available_at <= UTC_TIMESTAMP()
          ORDER BY j.available_at, j.job_id LIMIT 1 FOR UPDATE SKIP LOCKED`, timeout: databaseTimeout });
        if (!rows.length) return undefined;
        const job = rows[0];
        await connection.query({ sql: `UPDATE ai_visual_jobs SET status = 'PROCESSING', attempts = attempts + 1,
          locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 MINUTE), lease_token = ?, last_error_code = NULL, updated_at = UTC_TIMESTAMP()
          WHERE job_id = ?`, timeout: databaseTimeout }, [leaseToken, job.job_id]);
        return { ...job, lease_token: leaseToken, attempts: Number(job.attempts) + 1 };
      });
    },
    async renewLease(job) {
      if (!job.lease_token) return false;
      const [result] = await query(pool, `UPDATE ai_visual_jobs SET locked_until=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 MINUTE), updated_at=UTC_TIMESTAMP()
        WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND locked_until>UTC_TIMESTAMP()`, [job.job_id, job.lease_token]);
      return result.affectedRows === 1;
    },
    async saveEmbedding(job, embeddingData) {
      return transaction(pool, async (connection) => {
        const [[context]] = await connection.query({ sql: `SELECT i.item_id, i.type, i.status FROM ai_visual_jobs j
          JOIN item_images im ON im.image_id = j.image_id JOIN items i ON i.item_id = im.item_id
          WHERE j.job_id = ? AND j.status = 'PROCESSING' AND j.lease_token=? AND j.locked_until>UTC_TIMESTAMP() FOR UPDATE`, timeout: databaseTimeout }, [job.job_id, job.lease_token]);
        if (!context) return undefined;
        if (!['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(context.status)) {
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
        const [[item]] = await connection.query({ sql: `SELECT i.status FROM ai_visual_jobs j
          JOIN item_images im ON im.image_id=j.image_id JOIN items i ON i.item_id=im.item_id
          WHERE j.job_id=? AND j.status='PROCESSING' AND j.lease_token=? AND j.locked_until>UTC_TIMESTAMP() FOR UPDATE`, timeout: databaseTimeout }, [job.job_id, job.lease_token]);
        if (!item) return false;
        if (!['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(item.status)) {
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
        ORDER BY im.image_id LIMIT ?`, [modelId, modelRevision, type === 'LOST' ? 'FOUND' : 'LOST', itemId, afterImageId, limit]);
      return rows;
    },
    async upsertCandidates(job, itemId, type, modelId, modelRevision, candidates) {
      if (!candidates.length) return true;
      return transaction(pool, async (connection) => {
        const [[lease]] = await connection.query({ sql: `SELECT job_id FROM ai_visual_jobs
          WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND locked_until>UTC_TIMESTAMP() FOR UPDATE`, timeout: databaseTimeout }, [job.job_id, job.lease_token]);
        if (!lease) return false;
        for (const candidate of candidates) {
          const lostId = type === 'LOST' ? itemId : candidate.itemId;
          const foundId = type === 'FOUND' ? itemId : candidate.itemId;
          if (String(lostId) === String(foundId)) continue;
          await connection.query({ sql: `INSERT INTO ai_visual_candidates
            (lost_item_id, found_item_id, model_id, model_revision, cosine_score, updated_at)
            VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE cosine_score=GREATEST(cosine_score, VALUES(cosine_score)), updated_at=UTC_TIMESTAMP()`, timeout: databaseTimeout },
          [lostId, foundId, modelId, modelRevision, candidate.score]);
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
