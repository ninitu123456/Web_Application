import { readFile, writeFile } from 'node:fs/promises';
import { configFromEnv } from './config.js';
import { connect } from './connection.js';
import { assertIsolatedInstance } from './assert-isolated.js';
import { checksum, dryRunPurge, executePurge } from './demo-purge.js';
const options = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--([a-z-]+)(?:=(.+))?$/.exec(arg);
  if (!match || Object.hasOwn(options, match[1])) throw new Error('Invalid or repeated purge argument');
  options[match[1]] = match[2] ?? true;
}
const allowed = [
  'execute',
  'manifest',
  'confirm',
  'target-fingerprint',
  'scope',
  'output',
  'receipt-output',
  'backup-receipt',
  'maintenance-window',
  'production-read',
  'production-execute',
  'expect-server',
  'expect-host',
  'expect-port',
  'expect-database',
];
if (Object.keys(options).some((key) => !allowed.includes(key))) throw new Error('Unknown purge option');
for (const flag of ['execute', 'maintenance-window', 'production-read', 'production-execute'])
  if (options[flag] !== undefined && options[flag] !== true)
    throw new Error('Boolean purge flags do not accept values');
let connection;
try {
  const isolated = !options['production-read'] && !options['production-execute'];
  if (isolated) await assertIsolatedInstance();
  else if (
    process.env.NODE_ENV !== 'production' ||
    process.env.FINDIT_ISOLATED_DATADIR ||
    !options['expect-server'] ||
    !options['expect-host'] ||
    !options['expect-port'] ||
    options['expect-database'] !== 'findit_db'
  )
    throw new Error(
      'Production access needs explicit reviewed server/host/port/database and NODE_ENV=production',
    );
  if (options['production-read'] && options.execute)
    throw new Error('Read-only approval does not authorize execution');
  if (options['production-execute'] && !options.execute) throw new Error('Use --production-read for dry-run');
  const config = configFromEnv();
  if (
    !isolated &&
    (config.host !== options['expect-host'] || String(config.port) !== String(options['expect-port']))
  )
    throw new Error('Configured production endpoint differs from reviewed target');
  connection = await connect(config);
  if (!isolated) {
    const [[target]] = await connection.query('SELECT @@server_uuid uuid,DATABASE() db');
    if (target.uuid !== options['expect-server'] || target.db !== options['expect-database'])
      throw new Error('Production server identity mismatch');
  }
  if (!options.execute) {
    const scope = options.scope ? JSON.parse(await readFile(options.scope, 'utf8')) : {};
    const manifest = await dryRunPurge(connection, scope);
    if (options.output)
      await writeFile(options.output, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    if (
      !options.manifest ||
      !options['receipt-output'] ||
      !options.confirm ||
      !options['target-fingerprint'] ||
      !options['maintenance-window']
    )
      throw new Error(
        'Execute requires manifest, exact confirmation/target, maintenance window and new receipt output',
      );
    const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
    const pending = {
      state: 'PENDING',
      manifestFingerprint: manifest.fingerprint,
      targetFingerprint: manifest.targetFingerprint,
      assets: manifest.assets,
    };
    await writeFile(options['receipt-output'], JSON.stringify(pending, null, 2), { flag: 'wx', mode: 0o600 });
    const result = await executePurge(connection, manifest, {
      confirm: options.confirm,
      targetFingerprint: options['target-fingerprint'],
      maintenance: true,
      isolated,
      backupReceipt: options['backup-receipt']
        ? JSON.parse(await readFile(options['backup-receipt'], 'utf8'))
        : undefined,
    });
    const receipt = { state: 'COMMITTED', ...result };
    receipt.receiptChecksum = checksum(receipt);
    await writeFile(options['receipt-output'], JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(
      JSON.stringify({
        state: receipt.state,
        deleted: receipt.deleted,
        protectedAdmins: receipt.protectedAdmins.length,
        manifestFingerprint: receipt.manifestFingerprint,
        cloudinaryDeletion: 'NOT_EXECUTED',
      }),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      error: error.code === 'PURGE_COMMIT_UNCERTAIN' ? 'PURGE_COMMIT_UNCERTAIN' : 'PURGE_REFUSED',
      message:
        error.code === 'PURGE_COMMIT_UNCERTAIN'
          ? 'Commit outcome uncertain; reconcile read-only.'
          : error.code
            ? 'Database operation refused; inspect target and manifest without logging credentials.'
            : error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  if (connection) await connection.end().catch(() => {});
}
