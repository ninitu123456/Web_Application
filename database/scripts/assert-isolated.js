import { isAbsolute, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { configFromEnv } from './config.js';
import { connect } from './connection.js';

// Fail before opening a connection unless the isolated runner supplied its identity.
export async function assertIsolatedInstance(env = process.env, open = connect) {
  if (!env.FINDIT_ISOLATED_DATADIR || env.DB_HOST !== '127.0.0.1') {
    throw new Error('Use test:integration:isolated; an isolated MySQL identity is required');
  }
  const expectedDirectory = resolve(env.FINDIT_ISOLATED_DATADIR);
  const temporaryPath = relative(resolve(tmpdir()), expectedDirectory);
  const parts = temporaryPath.split(sep);
  if (isAbsolute(temporaryPath) || parts.length !== 2 || !/^findit-mysql-[a-zA-Z0-9_-]+$/.test(parts[0]) || parts[1] !== 'data') {
    throw new Error('An isolated MySQL datadir under the approved temporary directory is required');
  }
  const targetPort = Number(env.DB_PORT);
  if (!env.DB_PORT || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535 || [3306, 3311].includes(targetPort)) {
    throw new Error('Isolated MySQL requires an explicit non-service port; ports 3306 and 3311 are forbidden');
  }
  const config = configFromEnv(env);
  const connection = await open(config, false);
  try {
    const [[instance]] = await connection.query('SELECT @@datadir AS directory, @@port AS port');
    if ([3306, 3311].includes(Number(instance.port)) ||
        resolve(instance.directory) !== expectedDirectory || Number(instance.port) !== targetPort) {
      throw new Error('Isolated MySQL identity mismatch; refusing test writes');
    }
  } finally { await connection.end(); }
}

export function assertOwnedDatabase(name, ownedName) {
  if (name !== ownedName || !/^findit_test_[a-f0-9]{24}$/.test(name)) throw new Error('Refusing unowned database cleanup');
}
