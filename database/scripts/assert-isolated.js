import { resolve } from 'node:path';
import { configFromEnv } from './config.js';
import { connect } from './connection.js';

// Fail before opening a connection unless the isolated runner supplied its identity.
export async function assertIsolatedInstance(env = process.env, open = connect) {
  if (!env.FINDIT_ISOLATED_DATADIR || env.DB_HOST !== '127.0.0.1') {
    throw new Error('Use test:integration:isolated; an isolated MySQL identity is required');
  }
  const config = configFromEnv(env);
  const connection = await open(config, false);
  try {
    const [[instance]] = await connection.query('SELECT @@datadir AS directory, @@port AS port');
    if (resolve(instance.directory) !== resolve(env.FINDIT_ISOLATED_DATADIR) || Number(instance.port) !== config.port) {
      throw new Error('Isolated MySQL identity mismatch; refusing test writes');
    }
  } finally { await connection.end(); }
}

export function assertOwnedDatabase(name, ownedName) {
  if (name !== ownedName || !/^findit_test_[a-f0-9]{24}$/.test(name)) throw new Error('Refusing unowned database cleanup');
}
