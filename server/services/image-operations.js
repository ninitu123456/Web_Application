import { randomUUID } from 'node:crypto';
import { withConnection, inTransaction, connectionUnusable, databaseTimeout } from '../config/db.js';
import { HttpError } from '../utils/http-error.js';
import { logError } from '../utils/logger.js';

// Append-only lifecycle events in the existing activity log form a durable
// cleanup journal. A committed event is written WITH the image transaction.
// Never infer rollback from a lost COMMIT response, or delete a referenced asset.
const budgets = new WeakMap();
function budget(pool, options) {
  if (budgets.has(pool)) return budgets.get(pool);
  const concurrency = Number(options.concurrency ?? process.env.IMAGE_OPERATION_CONCURRENCY ?? 4);
  const queueLimit = Number(options.queueLimit ?? process.env.IMAGE_OPERATION_QUEUE_LIMIT ?? 20);
  const waitMs = Number(options.waitMs ?? process.env.IMAGE_OPERATION_WAIT_MS ?? 5000);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency >= 10 ||
      !Number.isSafeInteger(queueLimit) || queueLimit < 0 || !Number.isSafeInteger(waitMs) || waitMs < 1) throw new Error('Invalid image admission configuration');
  let active = 0;
  const waiting = [];
  const overloaded = () => new HttpError(503, 'Hệ thống xử lý ảnh đang bận');
  async function admit(operation) {
    if (active >= concurrency) {
      if (waiting.length >= queueLimit) throw overloaded();
      await new Promise((resolve, reject) => {
        const entry = { resolve, timer: setTimeout(() => {
          waiting.splice(waiting.indexOf(entry), 1); reject(overloaded());
        }, waitMs) };
        waiting.push(entry);
      });
    } else active++;
    try { return await operation(); }
    finally {
      const next = waiting.shift();
      if (next) { clearTimeout(next.timer); next.resolve(); }
      else active--;
    }
  }
  budgets.set(pool, admit);
  return admit;
}
export function createImageOperations(pool, storage, logger = logError, options = {}) {
  const admit = budget(pool, options);
  const runQuery = (connection, sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
  async function event(connection, action, itemId, details, userId = null) {
    await runQuery(connection, 'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, \'ITEM\', ?, ?, UTC_TIMESTAMP())',
      [userId, action, itemId, JSON.stringify(details)]);
  }
  async function recover(connection, operationId) {
    const [[start]] = await runQuery(connection,
      "SELECT entity_id, details FROM activity_logs WHERE action = 'IMAGE_OPERATION_STARTED' AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.operationId')) = ? LIMIT 1", [operationId]);
    if (!start) return;
    const cleanup = await inTransaction(connection, async (scoped) => {
      const run = (sql, values = []) => runQuery(scoped, sql, values);
      // Synchronize with any uncertain COMMIT before inspecting its marker.
      await run('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [start.entity_id]);
      const [events] = await run(
        "SELECT action FROM activity_logs WHERE action IN ('IMAGE_OPERATION_COMMITTED', 'IMAGE_CLEANUP_COMPLETED') AND JSON_UNQUOTE(JSON_EXTRACT(details, '$.operationId')) = ?", [operationId]);
      if (events.some((entry) => entry.action === 'IMAGE_CLEANUP_COMPLETED')) return;
      const details = typeof start.details === 'string' ? JSON.parse(start.details) : start.details;
      const committed = events.some((entry) => entry.action === 'IMAGE_OPERATION_COMMITTED');
      if (details.kind === 'UPLOAD' && committed) return;
      const publicIds = details.kind === 'UPLOAD' || committed ? details.publicIds : [];
      for (const publicId of publicIds) {
        const [[reference]] = await run('SELECT image_id FROM item_images WHERE cloudinary_public_id = ? LIMIT 1', [publicId]);
        if (reference) throw new Error('Refusing to remove a referenced image');
      }
      return { publicIds };
    });
    if (!cleanup) return;
    // The operation advisory lock owns these unique public IDs throughout
    // cleanup. No database transaction stays open during external storage IO.
    if (cleanup.publicIds.length && !storage) throw new Error('Image cleanup storage is unavailable');
    for (const publicId of cleanup.publicIds) await storage.destroy(publicId);
    await event(connection, 'IMAGE_CLEANUP_COMPLETED', start.entity_id, { operationId });
  }

  async function locked(operationId, operation) {
    return admit(() => withConnection(pool, async (connection) => {
      const name = `findit:image:${operationId}`;
      const [[lock]] = await runQuery(connection, 'SELECT GET_LOCK(?, 0) AS acquired', [name]);
      if (Number(lock.acquired) !== 1) return false;
      try { await operation(connection); return true; }
      finally {
        try {
          if (!connectionUnusable(connection)) {
            const [[released]] = await runQuery(connection, 'SELECT RELEASE_LOCK(?) AS released', [name]);
            if (Number(released.released) !== 1) throw new Error('Image operation lock release not confirmed');
          }
        }
        catch (error) { error.fatal = true; throw error; }
      }
    }));
  }
  return {
    async run(details, operation) {
      const operationId = randomUUID();
      let result;
      const acquired = await locked(operationId, async (connection) => {
        await event(connection, 'IMAGE_OPERATION_STARTED', details.itemId, { ...details, operationId }, details.userId);
        try { result = await operation(operationId, connection); }
        catch (error) {
          try { if (!connectionUnusable(connection)) await recover(connection, operationId); }
          catch (cleanupError) {
            logger('image_cleanup_pending', cleanupError);
            if (cleanupError.fatal || cleanupError.code === 'PROTOCOL_SEQUENCE_TIMEOUT') error.fatal = true;
          }
          throw error;
        }
        if (details.kind === 'DELETE') {
          try { if (!connectionUnusable(connection)) await recover(connection, operationId); }
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
      let pending = [];
      // Persist progress before attempts: failed/busy operations cannot pin the
      // head of the journal, even when the worker process restarts each round.
      await locked('cleanup-scan', (connection) => inTransaction(connection, async (scoped) => {
        const run = (sql, values = []) => runQuery(scoped, sql, values);
        const [[cursor]] = await run("SELECT log_id, details FROM activity_logs WHERE action = 'IMAGE_CLEANUP_CURSOR' ORDER BY log_id LIMIT 1 FOR UPDATE");
        const state = cursor ? (typeof cursor.details === 'string' ? JSON.parse(cursor.details) : cursor.details) : { after: 0, ceiling: 0 };
        if (!state.ceiling) {
          const [[maximum]] = await run('SELECT COALESCE(MAX(log_id), 0) AS maximum FROM activity_logs');
          state.ceiling = String(maximum.maximum);
        }
        const [rows] = await run(`SELECT s.log_id, s.details FROM activity_logs s
          WHERE s.action = 'IMAGE_OPERATION_STARTED' AND s.log_id > ? AND s.log_id <= ?
          AND NOT EXISTS (SELECT 1 FROM activity_logs e
            WHERE JSON_UNQUOTE(JSON_EXTRACT(e.details, '$.operationId')) = JSON_UNQUOTE(JSON_EXTRACT(s.details, '$.operationId'))
            AND (e.action = 'IMAGE_CLEANUP_COMPLETED' OR (e.action = 'IMAGE_OPERATION_COMMITTED' AND JSON_UNQUOTE(JSON_EXTRACT(s.details, '$.kind')) = 'UPLOAD')))
          ORDER BY s.log_id LIMIT 100`, [state.after, state.ceiling]);
        pending = rows;
        state.after = rows.length === 100 ? String(rows.at(-1).log_id) : 0;
        if (rows.length < 100) state.ceiling = 0;
        if (cursor) await run('UPDATE activity_logs SET details=? WHERE log_id=?', [JSON.stringify(state), cursor.log_id]);
        else await run("INSERT INTO activity_logs(action,entity_type,details,created_at) VALUES('IMAGE_CLEANUP_CURSOR','IMAGE_CLEANUP',?,UTC_TIMESTAMP())", [JSON.stringify(state)]);
      }));
      const result = { completed: 0, busy: 0, failed: 0 };
      for (const entry of pending) {
        try {
          const details = typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details;
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
