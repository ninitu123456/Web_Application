import { createHash } from 'node:crypto';
import { withConnection, databaseTimeout, inTransaction, connectionUnusable } from '../config/db.js';
import { HttpError } from '../utils/http-error.js';

// Lock BEFORE BEGIN: every attempt sees commits from the preceding writer.
// Image mutations take only their existing single Item lock, never this lock.
export function matchingTransaction(pool, operation) {
  return withConnection(pool, async (connection) => {
    const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
    const [[database]] = await run('SELECT DATABASE() AS name');
    const name = `findit:match:${createHash('sha256').update(database.name).digest('hex').slice(0, 48)}`;
    let uncertain = false, acquired = false;
    try {
      // Query timeout exceeds the server's bounded lock wait.
      const [[lock]] = await run('SELECT GET_LOCK(?, 2) AS acquired', [name]);
      if (Number(lock.acquired) !== 1) throw new HttpError(503, 'Hệ thống ghép nối đang bận, vui lòng thử lại');
      acquired = true;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await inTransaction(connection, operation);
        } catch (error) {
          if (error.fatal || error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
            uncertain = true; error.fatal = true; throw error;
          }
          if (!['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code) || attempt === 2) throw error;
        }
      }
    } catch (error) {
      if (error.fatal || error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') uncertain = true;
      throw error;
    } finally {
      // withConnection destroys rather than releasing any uncertain session.
      if (!uncertain && !connectionUnusable(connection)) {
        try {
          // Also cleans up a GET_LOCK response error whose outcome was uncertain.
          const [[released]] = await run('SELECT RELEASE_LOCK(?) AS released', [name]);
          if (acquired && Number(released.released) !== 1) throw new Error('Matching lock release not confirmed');
        } catch (error) { error.fatal = true; throw error; }
      }
    }
  });
}
