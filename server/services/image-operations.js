import { randomUUID } from 'node:crypto';
import { query, withConnection, inTransaction, databaseTimeout } from '../config/db.js';
import { HttpError } from '../utils/http-error.js';
import { logError } from '../utils/logger.js';

// Append-only lifecycle events in the existing activity log form a durable
// cleanup journal. A committed event is written WITH the image transaction.
// Never infer rollback from a lost COMMIT response, or delete a referenced asset.
export function createImageOperations(pool, storage, logger = logError) {
  const runQuery = (connection, sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
  async function event(connection, action, itemId, details, userId = null) {
    await runQuery(connection, 'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, \'ITEM\', ?, ?, UTC_TIMESTAMP())',
      [userId, action, itemId, JSON.stringify(details)]);
  }
  async function recover(connection, operationId) {
    const [[start]] = await runQuery(connection,
      "SELECT entity_id, details FROM activity_logs WHERE action = 'IMAGE_OPERATION_STARTED' AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.operationId')) = ? LIMIT 1", [operationId]);
    if (!start) return;
    return inTransaction(connection, async () => {
      // Wait for any outstanding image transaction BEFORE inspecting its commit
      // marker. This also covers a lost COMMIT response on another connection.
      await runQuery(connection, 'SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [start.entity_id]);
      const [events] = await runQuery(connection,
        "SELECT action FROM activity_logs WHERE action IN ('IMAGE_OPERATION_COMMITTED', 'IMAGE_CLEANUP_COMPLETED') AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.operationId')) = ?", [operationId]);
      if (events.some((entry) => entry.action === 'IMAGE_CLEANUP_COMPLETED')) return;
      const details = typeof start.details === 'string' ? JSON.parse(start.details) : start.details;
      const committed = events.some((entry) => entry.action === 'IMAGE_OPERATION_COMMITTED');
      if (details.kind === 'UPLOAD' && committed) return;
      if (details.kind === 'UPLOAD' || committed) {
        if (details.publicIds.length && !storage) throw new Error('Image cleanup storage is unavailable');
        for (const publicId of details.publicIds) {
          const [[reference]] = await runQuery(connection, 'SELECT image_id FROM item_images WHERE cloudinary_public_id = ? LIMIT 1', [publicId]);
          if (reference) throw new Error('Refusing to remove a referenced image');
          await storage.destroy(publicId);
        }
      }
      await event(connection, 'IMAGE_CLEANUP_COMPLETED', start.entity_id, { operationId });
    });
  }
  async function locked(operationId, operation) {
    return withConnection(pool, async (connection) => {
      const name = `findit:image:${operationId}`;
      const [[lock]] = await runQuery(connection, 'SELECT GET_LOCK(?, 0) AS acquired', [name]);
      if (Number(lock.acquired) !== 1) return false;
      try { await operation(connection); return true; }
      finally {
        try { await runQuery(connection, 'SELECT RELEASE_LOCK(?)', [name]); }
        catch (error) { error.fatal = true; throw error; }
      }
    });
  }
  return {
    async run(details, operation) {
      const operationId = randomUUID();
      let result;
      const acquired = await locked(operationId, async (connection) => {
        await event(connection, 'IMAGE_OPERATION_STARTED', details.itemId, { ...details, operationId }, details.userId);
        try { result = await operation(operationId); }
        catch (error) {
          try { await recover(connection, operationId); }
          catch (cleanupError) {
            logger('image_cleanup_pending', cleanupError);
            if (cleanupError.fatal || cleanupError.code === 'PROTOCOL_SEQUENCE_TIMEOUT') error.fatal = true;
          }
          throw error;
        }
        if (details.kind === 'DELETE') {
          try { await recover(connection, operationId); }
          catch (cause) {
            logger('image_cleanup_pending', cause);
            throw new HttpError(503, 'Chưa thể hoàn tất xóa ảnh; tác vụ đã được lưu để thử lại', { cause });
          }
        }
      });
      if (!acquired) throw new HttpError(503, 'Tác vụ ảnh đang được xử lý');
      return result;
    },
    async recoverPending() {
      const [pending] = await query(pool, `SELECT s.details FROM activity_logs s
        WHERE s.action = 'IMAGE_OPERATION_STARTED'
        AND NOT EXISTS (SELECT 1 FROM activity_logs e
          WHERE JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.operationId')) = JSON_UNQUOTE(JSON_EXTRACT(s.details, '$.operationId'))
          AND (e.action = 'IMAGE_CLEANUP_COMPLETED' OR (e.action = 'IMAGE_OPERATION_COMMITTED' AND JSON_UNQUOTE(JSON_EXTRACT(s.details, '$.kind')) = 'UPLOAD')))
        ORDER BY s.log_id LIMIT 100`);
      const result = { completed: 0, busy: 0, failed: 0 };
      for (const entry of pending) {
        const details = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
        try {
          if (await locked(details.operationId, (connection) => recover(connection, details.operationId))) result.completed++;
          else result.busy++;
        } catch (error) { result.failed++; logger('image_cleanup_pending', error); }
      }
      return result;
    }
  };
}

export function startImageCleanup(operations, { intervalMs = 60000, logger = logError } = {}) {
  let pending, stopped = false;
  function recover() {
    if (stopped || pending) return;
    pending = Promise.resolve().then(() => operations.recoverPending())
      .catch((error) => logger('image_cleanup_failed', error))
      .finally(() => { pending = undefined; });
  }
  const timer = setInterval(recover, intervalMs);
  timer.unref();
  recover();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
