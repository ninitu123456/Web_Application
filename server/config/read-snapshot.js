import { withConnection, inTransaction, databaseTimeout } from './db.js';

// SET TRANSACTION affects only the next transaction, never the pooled session's
// default isolation. inTransaction destroys ambiguous BEGIN/COMMIT sessions.
export function readSnapshot(pool, operation) {
  return withConnection(pool, async (connection) => {
    await connection.query({ sql: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', timeout: databaseTimeout });
    return inTransaction(connection, operation);
  });
}
