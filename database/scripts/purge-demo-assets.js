import { readFile, writeFile } from 'node:fs/promises';
import { v2 as cloudinary } from 'cloudinary';
import { configFromEnv } from './config.js';
import { connect } from './connection.js';
import { assertIsolatedInstance } from './assert-isolated.js';
import { checksum } from './demo-purge.js';
import { planDemoAssets, executeDemoAssets } from './demo-assets.js';
const options = {};
for (const arg of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.+))?$/.exec(arg);
  if (!m || Object.hasOwn(options, m[1])) throw new Error('Invalid asset cleanup argument');
  options[m[1]] = m[2] ?? true;
}
if (
  Object.keys(options).some(
    (k) =>
      ![
        'receipt',
        'manifest',
        'confirm',
        'output',
        'execute',
        'maintenance-window',
        'expected-target',
        'production-access',
        'retry-results',
      ].includes(k),
  )
)
  throw new Error('Unknown asset cleanup argument');
for (const flag of ['execute', 'maintenance-window', 'production-access'])
  if (options[flag] !== undefined && options[flag] !== true)
    throw new Error('Boolean asset flags do not accept values');
let connection;
try {
  if (!options.output || !options['expected-target'])
    throw new Error('New output path and expected DB target fingerprint are required');
  if (options['production-access']) {
    if (process.env.NODE_ENV !== 'production' || process.env.FINDIT_ISOLATED_DATADIR)
      throw new Error('Explicit reviewed production access requires NODE_ENV=production');
  } else await assertIsolatedInstance();
  const document = JSON.parse(await readFile(options.execute ? options.manifest : options.receipt, 'utf8'));
  if (document.targetFingerprint !== options['expected-target']) throw new Error('Reviewed target mismatch');
  connection = await connect(configFromEnv());
  const [[live]] = await connection.query(
    'SELECT DATABASE() db,@@server_uuid uuid,@@port port,@@datadir datadir',
  );
  const actual = checksum({
    database: live.db,
    serverUuid: live.uuid,
    port: Number(live.port),
    datadirChecksum: checksum(live.datadir),
  });
  if (actual !== options['expected-target']) throw new Error('Live DB target mismatch');
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET)
    throw new Error('Explicit scoped Cloudinary configuration required');
  cloudinary.config({
    cloud_name: cloudName,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  const adapter = {
    cloudName,
    resource: (id) => cloudinary.api.resource(id, { resource_type: 'image', type: 'upload' }),
    destroy: (id) =>
      cloudinary.uploader.destroy(id, { resource_type: 'image', type: 'upload', invalidate: true }),
    hasReference: async (id) =>
      (
        await connection.query('SELECT image_id FROM item_images WHERE cloudinary_public_id=? LIMIT 1', [id])
      )[0].length > 0,
  };
  if (!options.execute) {
    const plan = await planDemoAssets(document, adapter);
    await writeFile(options.output, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(
      JSON.stringify({
        fingerprint: plan.fingerprint,
        assets: plan.assets.length,
        excluded: plan.excluded.length,
        deleted: 0,
      }),
    );
  } else {
    if (!options['maintenance-window'] || !options.confirm)
      throw new Error('Separate exact asset confirmation and maintenance window required');
    const prior = options['retry-results']
      ? JSON.parse(await readFile(options['retry-results'], 'utf8'))
      : undefined;
    if (prior && prior.manifestFingerprint !== document.fingerprint)
      throw new Error('Retry results belong to another asset manifest');
    const report = { manifestFingerprint: document.fingerprint, results: [] };
    await writeFile(options.output, JSON.stringify(report), { flag: 'wx', mode: 0o600 });
    const result = await executeDemoAssets(document, {
      ...adapter,
      confirm: options.confirm,
      maintenance: true,
      priorResults: prior?.results ?? [],
      onResult: async (row) => {
        report.results.push(row);
        await writeFile(options.output, JSON.stringify(report, null, 2), { mode: 0o600 });
      },
    });
    console.log(
      JSON.stringify({
        manifestFingerprint: result.manifestFingerprint,
        counts: Object.fromEntries(
          ['DELETED', 'FAILED', 'ALREADY_ABSENT', 'PREVIOUSLY_COMPLETED'].map((status) => [
            status,
            result.results.filter((row) => row.status === status).length,
          ]),
        ),
      }),
    );
    if (result.results.some((row) => row.status === 'FAILED')) process.exitCode = 1;
  }
} catch {
  console.error(
    'ASSET_CLEANUP_REFUSED: verify target, exact manifest, asset identity/references and operator approval; no secrets logged',
  );
  process.exitCode = 1;
} finally {
  if (connection) await connection.end().catch(() => {});
}
