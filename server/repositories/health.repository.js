import { performance } from 'node:perf_hooks';
import { destroyConnection, connectionUnusable } from '../config/db.js';
import { readHealthConfig } from '../config/env.js';

// Admission outlives the public deadline until the driver operation settles.
let admitted;
export function createHealthRepository(pool, { timeoutMs = readHealthConfig().timeoutMs } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new Error('Invalid health deadline');
  return {
    checkConnection() {
      if (admitted) return admitted.pool === pool ? admitted.result : Promise.reject(Object.assign(new Error('Health probe busy'), { code: 'HEALTH_PROBE_BUSY' }));
      const entry = { pool };
      admitted = entry;
      const deadlineAt = performance.now() + timeoutMs;
      let connection, expired = false, dispatched = false, timer;
      const timeout = () => Object.assign(new Error('Health probe deadline exceeded'), { code: 'HEALTH_PROBE_TIMEOUT' });
      const ensureActive = () => {
        if (expired || performance.now() >= deadlineAt) { expired = true; throw timeout(); }
      };
      const work = (async () => {
        try {
          connection = await pool.getConnection();
          ensureActive();
          const run = async (sql) => {
            ensureActive();
            dispatched = true;
            const result = await connection.query({ sql, timeout: Math.max(1, Math.ceil(deadlineAt - performance.now())) });
            ensureActive();
            return result;
          };
          await run("SET SESSION time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
          const [[row]] = await run('SELECT 1 AS ok, DATABASE() AS database_name');
          return row;
        } catch (error) {
          if (connection && dispatched && (expired || error.fatal || error.code === 'PROTOCOL_SEQUENCE_TIMEOUT')) destroyConnection(connection);
          throw error;
        } finally {
          if (connection && !connectionUnusable(connection)) connection.release();
          if (admitted === entry) admitted = undefined;
        }
      })();
      entry.result = Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          if (connection) destroyConnection(connection);
          reject(timeout());
        }, timeoutMs);
      })]).finally(() => clearTimeout(timer));
      return entry.result;
    }
  };
}
