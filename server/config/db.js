import mysql from 'mysql2/promise';
import { performance } from 'node:perf_hooks';
import { configFromEnv } from '../../database/scripts/config.js';

export const databaseTimeout = 5000;
const destroyedConnections = new WeakSet();
export function destroyConnection(connection) {
  if (!destroyedConnections.has(connection)) {
    destroyedConnections.add(connection);
    connection.destroy();
  }
}
export const connectionUnusable = (connection) => destroyedConnections.has(connection);
export function createDbPool(config = configFromEnv()) {
  return mysql.createPool({
    ...config, connectTimeout: databaseTimeout, connectionLimit: 10,
    waitForConnections: true, queueLimit: 20, enableKeepAlive: true
  });
}
function acquire(pool) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(Object.assign(new Error('Database pool acquisition timed out'), { code: 'DB_ACQUIRE_TIMEOUT' }));
    }, databaseTimeout);
    pool.getConnection().then((connection) => {
      clearTimeout(timer);
      if (expired) connection.release();
      else resolve(connection);
    }, (error) => { clearTimeout(timer); reject(error); });
  });
}
export async function withConnection(pool, operation) {
  const connection = await acquire(pool);
  let destroyed = false;
  try {
    await connection.query({
      sql: "SET SESSION time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
      timeout: databaseTimeout
    });
    return await operation(connection);
  } catch (error) {
    // A timed-out command must never continue on a connection returned to the pool.
    const cause = error.cause ?? error;
    if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || cause.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || error.fatal || cause.fatal) { destroyConnection(connection); destroyed = true; }
    throw error;
  } finally { if (!destroyed && !connectionUnusable(connection)) connection.release(); }
}
export function query(pool, sql, values = []) {
  return withConnection(pool, (connection) => connection.query({ sql, timeout: databaseTimeout }, values));
}

export function transaction(pool, operation) {
  return withConnection(pool, (connection) => inTransaction(connection, operation));
}

export async function inTransaction(connection, operation, { timeoutMs = 30000, boundaryTimeoutMs = databaseTimeout } = {}) {
  if (![timeoutMs, boundaryTimeoutMs].every((value) => Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid transaction deadline');
  const deadlineAt = performance.now() + timeoutMs;
  let began = false, committing = false;
  let active = true, aborted;
  const expire = (code) => {
    aborted ??= Object.assign(new Error('Database transaction deadline exceeded'), { code, fatal: true,
      ...(committing ? { commitOutcome: 'unknown' } : {}) });
    active = false;
    destroyConnection(connection);
    return aborted;
  };
  let rejectDeadline;
  const deadline = new Promise((_, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => rejectDeadline(expire('DB_TRANSACTION_TIMEOUT')), timeoutMs);
  const ensureActive = () => {
    // Timers may be delayed by synchronous work or a microtask backlog.
    // Check monotonic time at dispatch, rather than trusting the timer flag.
    if (active && performance.now() >= deadlineAt) throw expire('DB_TRANSACTION_TIMEOUT');
    if (!active || connectionUnusable(connection)) throw aborted ?? Object.assign(new Error('Transaction is no longer active'), { code: 'DB_TRANSACTION_CLOSED', fatal: true });
  };
  // The callback never receives the raw session: even a callback resumed after
  // timeout cannot enqueue SQL on a destroyed/released connection.
  const scoped = new Proxy(connection, { get(target, key) {
    if (['beginTransaction', 'commit', 'rollback', 'release', 'destroy'].includes(key)) return () => { throw new Error('Transaction lifecycle belongs to inTransaction'); };
    if (['connection', 'pool'].includes(key)) return undefined;
    const value = target[key];
    if (typeof value !== 'function') return value;
    return (...args) => { ensureActive(); return value.apply(target, args); };
  } });
  async function boundary(method) {
    ensureActive();
    const boundaryDeadlineAt = performance.now() + boundaryTimeoutMs;
    const ensureBoundaryActive = () => {
      ensureActive();
      if (performance.now() >= boundaryDeadlineAt) throw expire('DB_TRANSACTION_BOUNDARY_TIMEOUT');
    };
    let boundaryTimer;
    try {
      const result = await Promise.race([Promise.resolve().then(() => {
        ensureBoundaryActive();
        // Only a COMMIT actually dispatched to the driver can be uncertain.
        if (method === 'commit') committing = true;
        return connection[method]();
      }), new Promise((_, reject) => { boundaryTimer = setTimeout(() => reject(expire('DB_TRANSACTION_BOUNDARY_TIMEOUT')), boundaryTimeoutMs); })]);
      ensureBoundaryActive();
      return result;
    } finally { clearTimeout(boundaryTimer); }
  }
  async function work() {
    try {
      await boundary('beginTransaction');
      began = true;
      const result = await operation(scoped);
      ensureActive();
      await boundary('commit');
      ensureActive();
      return result;
    } catch (error) {
      if (aborted) throw aborted;
      if (!began || committing || error.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || error.fatal) {
        error.fatal = true;
        if (committing) error.commitOutcome = 'unknown';
        destroyConnection(connection);
        throw error;
      }
      try { await boundary('rollback'); }
      catch (rollbackError) {
        if (aborted) throw aborted;
        error.fatal = true; error.cause ??= rollbackError; destroyConnection(connection);
      }
      throw error;
    }
  }
  try { return await Promise.race([work(), deadline]); }
  finally { active = false; clearTimeout(timer); }
}
