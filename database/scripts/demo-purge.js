// No dotenv, network or database connection at import time. Manifests contain
// identifiers and hashes only; credential/payload values never leave memory.
import { assertIsolatedInstance } from './assert-isolated.js';
import { createHash } from 'node:crypto';
import { tables, metadata, quote } from '../schema.js';
import { featureTables } from '../features-schema.js';
import { verifyMigrations } from './migrate.js';
import { fixtures, marker } from '../seeds/sample.js';
export const purgeTables = [...tables, ...featureTables, metadata];
const byName = new Map(purgeTables.map((t) => [t.name, t]));
const protectedTables = new Set([
  'roles',
  'categories',
  'locations',
  '_schema_migrations',
  'ai_visual_catalog_state',
]);
const technical = new Set([
  'item_images',
  'item_image_embeddings',
  'ai_visual_jobs',
  'ai_visual_candidates',
  'ai_visual_demo_entities',
  'ai_visual_notification_preferences',
  'password_reset_tokens',
]);
const canonical = (value) =>
  value instanceof Date
    ? value.toISOString()
    : Buffer.isBuffer(value)
      ? { base64: value.toString('base64') }
      : Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
            )
          : typeof value === 'bigint'
            ? String(value)
            : value;
export const checksum = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const json = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const idOf = (table, row) =>
  table === 'password_reset_tokens'
    ? 'sha256:' + checksum(row[byName.get(table).pk])
    : String(row[byName.get(table).pk]);
const keyOf = (table, row) => table + ':' + idOf(table, row);
const mask = (email) =>
  typeof email === 'string' ? email.slice(0, 1) + '***@' + (email.split('@')[1] ?? 'hidden') : 'hidden';
const testEmail = (email) =>
  /@(?:example\.(?:com|org|net)|[^@]*\.(?:example|test|invalid|localhost)|(?:example|test|invalid|localhost))$/i.test(
    email ?? '',
  );
const uuid = (value) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value ?? '');
export async function readPurgeSnapshot(connection, { lock = false, maxRows = 10000 } = {}) {
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 10000)
    throw new Error('Invalid purge scan limit');
  const [[identity]] = await connection.query(
    'SELECT DATABASE() database_name,@@server_uuid server_uuid,@@port port,@@datadir datadir',
  );
  if (!identity.database_name) throw new Error('Purge requires an explicitly selected database');
  await verifyMigrations(connection, identity.database_name);
  const records = {};
  for (const table of purgeTables) {
    const [rows] = await connection.query(
      'SELECT * FROM ' +
        quote(table.name) +
        ' ORDER BY ' +
        quote(table.pk) +
        ' LIMIT ' +
        (maxRows + 1) +
        (lock ? ' FOR UPDATE' : ''),
    );
    if (rows.length > maxRows) throw new Error('Purge scan limit exceeded: ' + table.name);
    records[table.name] = rows;
  }
  return {
    target: {
      database: identity.database_name,
      serverUuid: identity.server_uuid,
      port: Number(identity.port),
      datadirChecksum: checksum(identity.datadir),
    },
    records,
  };
}
function references(table, row, records) {
  const refs = Object.values(byName.get(table).foreign ?? {})
    .filter((f) => row[f.column] !== null && row[f.column] !== undefined)
    .map((f) => f.table + ':' + String(row[f.column]));
  const entity = { ITEM: 'items', CLAIM: 'claims', USER: 'users' }[row.entity_type];
  if (table === 'activity_logs' && entity && row.entity_id) refs.push(entity + ':' + String(row.entity_id));
  if (table === 'email_outbox' && /^MATCH:[1-9]\d*$/.test(row.event_key))
    refs.push('matches:' + row.event_key.slice(6));
  if (table === 'notifications') {
    const match =
      /^(NEW_MATCH|NEW_CLAIM|CLAIM_APPROVED|CLAIM_REJECTED|CLAIM_COMPLETED|CLAIM_ADMIN_RESOLVED|ITEM_HIDDEN|ITEM_RESTORED|ITEM_MODERATED_CLOSED):([1-9]\d*)$/.exec(
        row.event_key ?? '',
      );
    if (match)
      refs.push(
        (match[1] === 'NEW_MATCH' ? 'matches' : match[1].includes('CLAIM') ? 'claims' : 'items') +
          ':' +
          match[2],
      );
    for (const decision of records.ai_visual_notification_decisions ?? [])
      if (decision.event_key === row.event_key)
        refs.push('ai_visual_notification_decisions:' + decision.decision_id);
  }
  if (table === 'ai_visual_snapshots') {
    const m = json(row.manifest);
    for (const item of [m?.lost, ...(m?.found ?? [])]) if (item?.id) refs.push('items:' + String(item.id));
  }
  return [...new Set(refs)];
}
export function buildPurgeManifest(snapshot, scope = {}) {
  const { records, target } = snapshot,
    all = new Map();
  for (const [table, rows] of Object.entries(records))
    for (const row of rows) all.set(keyOf(table, row), { table, id: idOf(table, row), row });
  const adminRoles = new Set(
    records.roles.filter((row) => row.name === 'ADMIN').map((row) => String(row.role_id)),
  );
  if (!adminRoles.size) throw new Error('ADMIN role cannot be verified');
  const protectedAdmins = records.users
    .filter((row) => adminRoles.has(String(row.role_id)))
    .map((row) => ({
      id: String(row.user_id),
      roleId: String(row.role_id),
      status: row.account_status,
      email: mask(row.email),
      rowChecksum: checksum(row),
      seedMarker: row.contact_info === marker,
    }));
  const protectedIds = new Set(protectedAdmins.map((row) => row.id));
  const confirmed = new Map(),
    possible = [];
  const register = (key, reason) => {
    if (all.has(key)) confirmed.set(key, reason);
  };
  for (const user of records.users) {
    if (protectedIds.has(String(user.user_id))) continue;
    if (user.contact_info === marker && user.full_name === 'FindIT Sample USER')
      register('users:' + user.user_id, 'Exact seed marker and USER fixture identity');
    else if (testEmail(user.email) || /^FindIT Sample /.test(user.full_name))
      possible.push({
        table: 'users',
        id: String(user.user_id),
        email: mask(user.email),
        reason: 'Test domain/name alone is insufficient',
      });
  }
  const seedIds = new Set(fixtures.map((f) => marker + ':' + f.key));
  for (const item of records.items) {
    if (seedIds.has(item.private_identifiers))
      register('items:' + item.item_id, 'Exact published seed private marker');
    else if (/^(\[Mẫu FindIT\]|AI UI synthetic|BrowserPaging)/.test(item.title))
      possible.push({ table: 'items', id: String(item.item_id), reason: 'Title alone is insufficient' });
  }
  for (const row of records.ai_visual_demo_entities) {
    if (!uuid(row.run_id)) continue;
    register(
      'ai_visual_demo_entities:' + row.demo_entity_id,
      'Explicit synthetic registry with valid run ID',
    );
    if (['LOST_ITEM', 'FOUND_ITEM'].includes(row.entity_role) && row.item_id) {
      const item = all.get('items:' + row.item_id)?.row;
      if (item && item.type === row.entity_role.slice(0, -5) && String(item.user_id) === String(row.user_id))
        register('items:' + row.item_id, 'Explicit item registry and matching owner/type');
    }
    if (
      ['LOST_OWNER', 'FOUND_OWNER'].includes(row.entity_role) &&
      row.user_id &&
      !protectedIds.has(String(row.user_id))
    )
      register('users:' + row.user_id, 'Explicit synthetic owner registry');
  }
  const selected = scope.roots
    ? new Set(scope.roots.map((root) => root.table + ':' + root.id))
    : new Set(confirmed.keys());
  for (const key of selected)
    if (all.has(key) && !confirmed.has(key))
      throw new Error('Root is not independently confirmed demo: ' + key);
  const approvals = new Map((scope.approvedRelated ?? []).map((row) => [row.table + ':' + row.id, row]));
  for (const [key, approval] of approvals) {
    if (!all.has(key)) continue;
    if (
      typeof approval.reason !== 'string' ||
      approval.reason.length < 12 ||
      approval.rowChecksum !== checksum(all.get(key)?.row)
    )
      throw new Error('Related approval needs exact checksum and independent evidence: ' + key);
    if (
      protectedTables.has(approval.table) ||
      (approval.table === 'users' && protectedIds.has(String(approval.id)))
    )
      throw new Error('Protected target in related approval');
    if (['items', 'users'].includes(approval.table) && !confirmed.has(key))
      throw new Error('Cannot approve unrelated real root as a dependency');
  }
  const proposed = new Map();
  for (const key of selected) {
    const record = all.get(key);
    if (record)
      proposed.set(key, { ...record, rootEntity: key, reason: confirmed.get(key), reviewRequired: false });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, record] of all) {
      if (
        proposed.has(key) ||
        protectedTables.has(record.table) ||
        (record.table === 'users' && protectedIds.has(record.id))
      )
        continue;
      const links = references(record.table, record.row, records),
        parent = links.find((ref) => proposed.has(ref));
      if (!parent) continue;
      const actorRefs = links.filter((ref) => ref.startsWith('users:') || ref.startsWith('items:'));
      const independent = confirmed.has(key);
      const mixed = actorRefs.some((ref) => !confirmed.has(ref) && !selected.has(ref));
      const reviewed = approvals.get(key);
      const allowed =
        independent ||
        technical.has(record.table) ||
        (!mixed && !['items', 'users'].includes(record.table)) ||
        Boolean(reviewed);
      proposed.set(key, {
        ...record,
        rootEntity: proposed.get(parent).rootEntity,
        reason: independent ? confirmed.get(key) : (reviewed?.reason ?? 'Dependent on ' + parent),
        reviewRequired: !allowed || (['items', 'users'].includes(record.table) && !independent),
      });
      changed = true;
    }
  }
  const describe = (record) => ({
    table: record.table,
    id: record.id,
    reason: record.reason,
    rootEntity: record.rootEntity,
    rowChecksum: checksum(record.row),
    relatedRecords: references(record.table, record.row, records)
      .filter((ref) => proposed.has(ref))
      .sort(),
  });
  const targets = [...proposed.values()]
    .filter((row) => !row.reviewRequired)
    .map(describe)
    .sort((a, b) => (a.table + ':' + a.id).localeCompare(b.table + ':' + b.id));
  const reviewRequired = [...proposed.values()]
    .filter((row) => row.reviewRequired)
    .map(describe)
    .sort((a, b) => (a.table + ':' + a.id).localeCompare(b.table + ':' + b.id));
  const images = new Set(targets.filter((row) => row.table === 'item_images').map((row) => row.id));
  const assets = [],
    protectedAssets = [];
  for (const image of records.item_images.filter(
    (row) => images.has(String(row.image_id)) && row.cloudinary_public_id,
  )) {
    const publicId = image.cloudinary_public_id;
    const refs = records.item_images.filter((row) => row.cloudinary_public_id === publicId);
    if (refs.some((row) => !images.has(String(row.image_id)))) {
      protectedAssets.push({ publicId, reason: 'Shared with retained image' });
      continue;
    }
    let url;
    try {
      url = new URL(image.image_url);
    } catch {}
    if (
      !/^findit\/items\/[a-f0-9-]{36}$/.test(publicId) ||
      !url ||
      url.protocol !== 'https:' ||
      url.hostname !== 'res.cloudinary.com' ||
      !url.pathname.includes('/image/upload/')
    ) {
      protectedAssets.push({ publicId, reason: 'Cloudinary ownership not verified' });
      continue;
    }
    if (!assets.some((row) => row.publicId === publicId))
      assets.push({
        publicId,
        cloudName: url.pathname.split('/')[1],
        imageIds: refs.map((row) => String(row.image_id)).sort(),
        urlChecksum: checksum(image.image_url),
      });
  }
  const snapshotFingerprint = checksum(
    Object.fromEntries(
      Object.entries(records).map(([table, rows]) => [
        table,
        rows.map((row) => ({ id: idOf(table, row), checksum: checksum(row) })),
      ]),
    ),
  );
  const possibleFinal = possible.filter((row) => !confirmed.has(row.table + ':' + row.id));
  const possibleKeys = new Set(possibleFinal.map((row) => row.table + ':' + row.id));
  const realOrUnrelated = [...all]
    .filter(
      ([key, row]) =>
        ['users', 'items'].includes(row.table) &&
        !confirmed.has(key) &&
        !possibleKeys.has(key) &&
        !(row.table === 'users' && protectedIds.has(row.id)),
    )
    .map(([, row]) => ({ table: row.table, id: row.id, reason: 'No independent demo evidence; retained' }));
  const manifest = {
    version: 1,
    target,
    targetFingerprint: checksum(target),
    snapshotFingerprint,
    scope,
    classifications: {
      confirmed: [...confirmed].map(([key, reason]) => ({ key, reason })),
      possible: possibleFinal,
      protectedAdmins,
      realOrUnrelated,
    },
    adminCountBefore: protectedAdmins.length,
    adminCountAfter: protectedAdmins.length,
    adminOwnedDemoItems: targets
      .filter(
        (row) => row.table === 'items' && protectedIds.has(String(all.get('items:' + row.id).row.user_id)),
      )
      .map((row) => row.id),
    roots: [...selected].filter((key) => all.has(key)).sort(),
    targets,
    reviewRequired,
    assets,
    protectedAssets,
    counts: Object.fromEntries(
      [...new Set(targets.map((row) => row.table))]
        .sort()
        .map((table) => [table, targets.filter((row) => row.table === table).length]),
    ),
  };
  if (targets.some((row) => row.table === 'users' && protectedIds.has(row.id)))
    throw new Error('ADMIN cannot be a delete target');
  return { ...manifest, fingerprint: checksum(manifest) };
}
export async function dryRunPurge(connection, scope = {}) {
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION READ ONLY');
  try {
    return buildPurgeManifest(await readPurgeSnapshot(connection), scope);
  } finally {
    await connection.rollback();
  }
}
function verifyBackup(receipt, manifest) {
  const age = Date.now() - Date.parse(receipt?.verifiedAt ?? '');
  if (
    receipt?.manifestFingerprint !== manifest.fingerprint ||
    receipt?.targetFingerprint !== manifest.targetFingerprint ||
    receipt?.restoreVerified !== true ||
    !/^[a-f0-9]{64}$/.test(receipt.backupSha256 ?? '') ||
    !/^[a-f0-9]{64}$/.test(receipt.restoreEvidenceSha256 ?? '') ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 86400000
  )
    throw new Error('Fresh reviewed backup/restore receipt bound to this exact manifest is required');
}
export async function executePurge(
  connection,
  manifest,
  { confirm, targetFingerprint, maintenance = false, isolated = false, backupReceipt, beforeDelete } = {},
) {
  const { fingerprint, ...body } = manifest;
  if (
    checksum(body) !== fingerprint ||
    confirm !== fingerprint ||
    targetFingerprint !== manifest.targetFingerprint
  )
    throw new Error('Manifest confirmation/fingerprint mismatch');
  if (!maintenance) throw new Error('Maintenance window with all writers/workers paused is required');
  if (isolated) await assertIsolatedInstance();
  else verifyBackup(backupReceipt, manifest);
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.beginTransaction();
  let committing = false;
  try {
    const before = await readPurgeSnapshot(connection, { lock: true });
    if (isolated) {
      const [[server]] = await connection.query('SELECT @@datadir directory,@@port port');
      if (
        !process.env.FINDIT_ISOLATED_DATADIR ||
        checksum(server.directory) !== manifest.target.datadirChecksum ||
        Number(server.port) !== Number(process.env.DB_PORT)
      )
        throw new Error('Disposable instance identity cannot be verified');
    }
    const fresh = buildPurgeManifest(before, manifest.scope);
    if (fresh.fingerprint !== fingerprint)
      throw new Error('Data or relationships changed; create and review a new dry-run');
    if (fresh.reviewRequired.length)
      throw new Error('Related records require independent review before deletion');
    const selected = new Set(fresh.targets.map((row) => row.table + ':' + row.id));
    const pending = [...fresh.targets];
    while (pending.length) {
      const ready = pending.find(
        (parent) =>
          !pending.some(
            (child) =>
              child !== parent &&
              references(
                child.table,
                before.records[child.table].find((row) => idOf(child.table, row) === child.id),
                before.records,
              ).includes(parent.table + ':' + parent.id),
          ),
      );
      if (!ready) throw new Error('Dependency cycle requires manual review');
      if (
        protectedTables.has(ready.table) ||
        fresh.classifications.protectedAdmins.some(
          (admin) => ready.table === 'users' && ready.id === admin.id,
        )
      )
        throw new Error('Protected delete refused');
      const definition = byName.get(ready.table),
        original = before.records[ready.table].find((row) => idOf(ready.table, row) === ready.id);
      await beforeDelete?.(ready);
      const [result] = await connection.query(
        'DELETE FROM ' + quote(ready.table) + ' WHERE ' + quote(definition.pk) + '=?',
        [original[definition.pk]],
      );
      if (result.affectedRows !== 1) throw new Error('Unexpected delete count');
      pending.splice(pending.indexOf(ready), 1);
    }
    const after = await readPurgeSnapshot(connection, { lock: true });
    for (const table of purgeTables) {
      const expected = before.records[table.name].filter((row) => !selected.has(keyOf(table.name, row)));
      if (checksum(expected) !== checksum(after.records[table.name]))
        throw new Error('Retained data or ADMIN changed: ' + table.name);
    }
    const remaining = buildPurgeManifest(after, manifest.scope);
    if (remaining.roots.length) throw new Error('Confirmed demo roots remain in approved scope');
    committing = true;
    await connection.commit();
    return {
      version: 1,
      manifestFingerprint: fingerprint,
      target: fresh.target,
      targetFingerprint: fresh.targetFingerprint,
      committedAt: new Date().toISOString(),
      deleted: fresh.counts,
      protectedAdmins: fresh.classifications.protectedAdmins,
      assets: fresh.assets,
    };
  } catch (error) {
    if (committing) {
      connection.destroy();
      throw Object.assign(
        new Error(
          'Purge commit result is uncertain; reconcile read-only and do not retry execute or delete assets',
        ),
        { code: 'PURGE_COMMIT_UNCERTAIN' },
      );
    }
    await connection.rollback();
    throw error;
  }
}
