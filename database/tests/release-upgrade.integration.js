import { assertIsolatedInstance, assertOwnedDatabase } from '../scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { configFromEnv } from '../scripts/config.js';
import { connect, initialize } from '../scripts/connection.js';
import { metadata, createTable } from '../schema.js';
import { migrationFiles, migrate, verifyMigrations } from '../scripts/migrate.js';
import { createDbPool, query } from '../../server/config/db.js';
import { createAdminModerationService } from '../../server/services/admin-moderation.service.js';
import { createAdminModerationRepository } from '../../server/repositories/admin-moderation.repository.js';

// Verified against origin/main a7cceb3: those 18 published SQL blobs are unchanged.
// The test uses the immutable release files, so shallow CI checkouts need no Git history.
const mainFeatures = new Set(['014_session_version.sql', '015_password_reset_tokens.sql', '016_email_outbox.sql', '017_conversations.sql', '018_messages.sql']);
test('release upgrades verified latest-main 18 migrations to 30 while preserving rows, audit visibility and checksums', {timeout: 90000}, async () => {
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const connection = await connect(base, false);
  let created = false, pool;
  try {
    await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await initialize(connection, name);
    const files = await migrationFiles();
    const predecessor = files.filter(file => Number(file.version.slice(0, 3)) <= 13 || mainFeatures.has(file.version));
    assert.equal(predecessor.length, 18);
    await connection.query(createTable(metadata));
    for (const file of predecessor) {
      // These validated, fixed schema files contain no semicolons inside literals.
      for (const sql of file.sql.split(/;\s*(?:\r?\n|$)/).map(x => x.trim()).filter(Boolean)) await connection.query(sql);
      await connection.execute("INSERT INTO _schema_migrations(version,checksum,status,started_at,applied_at) VALUES(?,?,'applied',UTC_TIMESTAMP(),UTC_TIMESTAMP())", [file.version, file.checksum]);
    }
    // Seed the historical schema directly: the release seed utility correctly
    // requires the COMPLETE release manifest, which is not applied yet here.
    await connection.query("INSERT INTO roles(name) VALUES('USER'),('ADMIN')");
    await connection.query("INSERT INTO categories(name) VALUES('Upgrade fixture')");
    await connection.query("INSERT INTO locations(name) VALUES('Upgrade lab')");
    const passwordHash = await bcrypt.hash(randomBytes(20).toString('hex'), 12);
    for (const [role, email] of [['USER', 'owner@release-upgrade.test'], ['ADMIN', 'admin@release-upgrade.test']]) {
      await connection.execute('INSERT INTO users(role_id,full_name,email,password_hash,created_at,updated_at) SELECT role_id,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM roles WHERE name=?', [role + ' fixture', email, passwordHash, role]);
    }
    const [[owner]] = await connection.query("SELECT user_id FROM users WHERE email='owner@release-upgrade.test'");
    const [[admin]] = await connection.query("SELECT user_id FROM users WHERE email='admin@release-upgrade.test'");
    const [item] = await connection.query(`INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
      SELECT ?,category_id,(SELECT MIN(location_id) FROM locations),'Hidden pre-upgrade fixture','Synthetic preserved record','FOUND','2026-11-07','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM categories ORDER BY category_id LIMIT 1`, [owner.user_id]);
    await connection.query("INSERT INTO activity_logs(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,'ITEM_HIDDEN','ITEM',?,'{}',UTC_TIMESTAMP())", [admin.user_id, item.insertId]);
    const [tables] = await connection.query('SHOW TABLES');
    const snapshot = async () => {
      const result = {};
      for (const row of tables) {
        const table = Object.values(row)[0]; assert.match(table, /^[a-z_]+$/);
        const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
        result[table] = rows.map(row => JSON.stringify(row)).sort();
      }
      return result;
    };
    const before = await snapshot();
    assert.equal(await migrate(connection, name), 12);
    assert.equal(await migrate(connection, name), 0);
    await verifyMigrations(connection, name);
    const after = await snapshot();
    for (const [table, rows] of Object.entries(before)) {
      if (table === '_schema_migrations') for (const row of rows) assert.ok(after[table].includes(row), 'Published migration ledger row preserved');
      else assert.deepEqual(after[table], rows, table + ' preserves every row');
    }
    pool = createDbPool({...base, database: name});
    const moderation = createAdminModerationService(createAdminModerationRepository(pool));
    const result = await moderation.setItemVisibility({id: String(admin.user_id), role: 'ADMIN'}, Number(item.insertId), {visibility: 'PUBLIC', reason: 'Synthetic upgrade restore'});
    assert.equal(result.item.visibility, 'PUBLIC');
    assert.equal(result.item.status, 'OPEN');
    const [[catalog]] = await query(pool, 'SELECT revision FROM ai_visual_catalog_state WHERE state_id=1');
    assert.equal(Number(catalog.revision), 1);
    const [[count]] = await connection.query('SELECT COUNT(*) AS n FROM _schema_migrations'); assert.equal(Number(count.n), 30);
  } finally {
    if (pool) await pool.end();
    try {if (created) {assertOwnedDatabase(name, name); await connection.query(`DROP DATABASE \`${name}\``);}}
    finally {await connection.end();}
  }
});
