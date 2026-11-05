import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tables, metadata, createTable } from '../schema.js';
import { assertExistingSchema, inspectTable } from './verify.js';
import { withLock } from './connection.js';
import { phase5Additions, phase5Alter } from '../phase5-schema.js';

export async function migrationFiles() {
  const directory = new URL('../migrations/', import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const legacyTables = tables.slice(0, 11);
  const visualTables = tables.slice(11);
  const tableMigrations = legacyTables.map((table, index) => `${String(index + 1).padStart(3, '0')}_${table.name}.sql`);
  const additiveMigrations = ['012_item_search_indexes.sql', '013_notification_report_support.sql'];
  const visualMigrations = visualTables.map((table, index) => `${String(index + 14).padStart(3, '0')}_${table.name}.sql`);
  const expected = [...tableMigrations, ...additiveMigrations, ...visualMigrations];
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error('Unexpected migration file list');
  const initial = await Promise.all(tableMigrations.map(async (version, index) => {
    const sql = await readFile(new URL(version, directory), 'utf8');
    if (sql.replace(/\r\n/g, '\n') !== createTable(tables[index])) throw new Error(`Migration differs from schema definition: ${version}`);
    return { version, sql, table: tables[index], kind: 'table', checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  const indexVersion = additiveMigrations[0], indexSql = await readFile(new URL(indexVersion, directory), 'utf8');
  const indexes = [
      { name: 'idx_items_status_event_date', columns: ['status', 'event_date'], sql: 'CREATE INDEX `idx_items_status_event_date` ON `items` (`status`, `event_date`)' },
      { name: 'idx_items_type_status', columns: ['type', 'status'], sql: 'CREATE INDEX `idx_items_type_status` ON `items` (`type`, `status`)' },
      { name: 'idx_items_created_at', columns: ['created_at'], sql: 'CREATE INDEX `idx_items_created_at` ON `items` (`created_at`)' }
  ];
  if (indexSql.replace(/\r\n/g, '\n').trim() !== indexes.map((index) => `${index.sql};`).join('\n')) throw new Error(`Migration differs from index definition: ${indexVersion}`);
  const phase5Version = additiveMigrations[1], phase5Sql = await readFile(new URL(phase5Version, directory), 'utf8');
  if (phase5Sql.replace(/\r\n/g, '\n').trim() !== Object.keys(phase5Additions).map(phase5Alter).join('\n')) throw new Error(`Migration differs from Phase 5 definition: ${phase5Version}`);
  const visual = await Promise.all(visualTables.map(async (table, index) => {
    const version = visualMigrations[index];
    const sql = await readFile(new URL(version, directory), 'utf8');
    if (sql.replace(/\r\n/g, '\n') !== createTable(table)) throw new Error(`Migration differs from schema definition: ${version}`);
    return { version, sql, table, kind: 'table', checksum: createHash('sha256').update(sql).digest('hex') };
  }));
  return [...initial, { version: indexVersion, sql: indexSql, table: tables.find((table) => table.name === 'items'), kind: 'index', indexes,
    checksum: createHash('sha256').update(indexSql).digest('hex') },
  { version: phase5Version, sql: phase5Sql, kind: 'phase5', checksum: createHash('sha256').update(phase5Sql).digest('hex') }, ...visual];
}
async function history(connection, files) {
  const [rows] = await connection.query('SELECT version, checksum, status FROM _schema_migrations ORDER BY version');
  for (const [index, row] of rows.entries()) {
    if (row.version !== files[index]?.version || row.checksum !== files[index]?.checksum ||
        !['running', 'applied'].includes(row.status) || (row.status === 'running' && index !== rows.length - 1)) {
      throw new Error('Migration history/checksum mismatch; manual review required');
    }
  }
  return rows;
}
export async function verifyMigrations(connection, database) {
  await assertExistingSchema(connection, database, { complete: true });
  const files = await migrationFiles();
  const rows = await history(connection, files);
  if (rows.length !== files.length || rows.some((row) => row.status !== 'applied')) throw new Error('Migrations are incomplete');
}
export async function migrate(connection, database) {
  const files = await migrationFiles();
  return withLock(connection, database, async () => {
    const existing = await assertExistingSchema(connection, database, { allowPendingAdditiveIndexes: true, allowPendingPhase5: true });
    if (!existing.includes(metadata.name) && existing.length) throw new Error('Existing tables have no migration history; manual review required');
    let rows = [];
    if (existing.includes(metadata.name)) rows = await history(connection, files);
    for (const file of files) {
      const row = rows.find((entry) => entry.version === file.version);
      if (file.kind === 'table' && existing.includes(file.table.name) && !row) throw new Error(`Untracked table ${file.table.name}; manual review required`);
      if (file.table && !existing.includes(file.table.name) && row?.status === 'applied') throw new Error(`Missing applied table ${file.table.name}`);
    }
    if (!existing.includes(metadata.name)) await connection.query(createTable(metadata));
    let applied = 0;
    for (const file of files) {
      const row = rows.find((entry) => entry.version === file.version);
      if (row?.status === 'applied') continue;
      if (file.kind === 'phase5') {
        const [duplicates] = await connection.query("SELECT reporter_id FROM reports WHERE status IN ('PENDING','REVIEWING') GROUP BY reporter_id, target_type, COALESCE(item_id, reported_user_id, claim_id) HAVING COUNT(*) > 1 LIMIT 1");
        if (duplicates.length) throw new Error('Duplicate open Reports; manual review required before Phase 5 migration');
      }
      if (!row) await connection.execute(
        "INSERT INTO _schema_migrations (version, checksum, status, started_at) VALUES (?, ?, 'running', UTC_TIMESTAMP())", [file.version, file.checksum]);
      // DDL commits implicitly. A persisted 'running' entry permits safe recovery
      // only after comparing every column, index, FK and CHECK to the manifest.
      if (file.kind === 'table') {
        if (!existing.includes(file.table.name)) await connection.query(file.sql);
      } else if (file.kind === 'phase5') {
        // Each ALTER is atomic on MySQL 8. A rerun accepts only the exact
        // before/after table shape, never repairs arbitrary partial definitions.
        for (const name of Object.keys(phase5Additions)) {
          const table = tables.find((table) => table.name === name);
          const [columns] = await connection.execute('SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?', [database, name, Object.keys(phase5Additions[name].columns)[0]]);
          if (!columns.length) await connection.query(phase5Alter(name));
          const problems = await inspectTable(connection, database, table);
          if (problems.length) throw new Error(problems.join('\n'));
        }
      } else {
        for (const index of file.indexes) {
          const [rows] = await connection.execute('SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX', [database, file.table.name, index.name]);
          if (!rows.length) await connection.query(index.sql);
          else if (JSON.stringify(rows.map((row) => row.name)) !== JSON.stringify(index.columns)) throw new Error(`Index ${index.name} differs from expected definition`);
        }
      }
      const problems = file.table ? await inspectTable(connection, database, file.table, { allowPendingAdditiveIndexes: file.kind === 'table', allowPendingPhase5: true }) : [];
      if (problems.length) throw new Error(problems.join('\n'));
      await connection.execute("UPDATE _schema_migrations SET status = 'applied', applied_at = UTC_TIMESTAMP() WHERE version = ?", [file.version]);
      applied++;
    }
    await verifyMigrations(connection, database);
    return applied;
  });
}
