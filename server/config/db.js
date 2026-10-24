import mysql from 'mysql2/promise';
import { configFromEnv } from '../../database/scripts/config.js';

export const databaseTimeout = 5000;
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
    if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || error.fatal) { connection.destroy(); destroyed = true; }
    throw error;
  } finally { if (!destroyed) connection.release(); }
}
export function query(pool, sql, values = []) {
  return withConnection(pool, (connection) => connection.query({ sql, timeout: databaseTimeout }, values));
}
