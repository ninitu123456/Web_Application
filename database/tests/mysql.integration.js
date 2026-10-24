import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { configFromEnv } from '../scripts/config.js';
import { connect, initialize } from '../scripts/connection.js';
import { migrate, verifyMigrations, migrationFiles } from '../scripts/migrate.js';
import { seed, verifySeed } from '../seeds/sample.js';
import { tables, quote } from '../schema.js';

export function assertTestDatabase(name, ownedName) {
  if (name !== ownedName || !/^findit_test_[a-f0-9]{24}$/.test(name)) throw new Error('Refusing to delete an unowned database');
}
const credentials = {
  ADMIN: { email: 'admin@findit.example.test', password: randomBytes(24).toString('hex') },
  USER: { email: 'user@findit.example.test', password: randomBytes(24).toString('hex') }
};
async function insert(connection, table, values) {
  const names = Object.keys(values);
  return connection.execute(`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map(() => '?').join(',')})`, Object.values(values));
}
async function snapshot(connection) {
  const result = {};
  for (const table of tables) {
    [result[table.name]] = await connection.query(`SELECT * FROM ${quote(table.name)} ORDER BY ${quote(table.pk)}`);
  }
  [result.history] = await connection.query('SELECT * FROM _schema_migrations ORDER BY version');
  return result;
}
const rejectCode = (task, numbers) => assert.rejects(task, (error) => numbers.includes(error.errno));

test('real MySQL: fresh setup, constraints, reruns, recovery and conflict protection', { timeout: 180000 }, async (t) => {
  const ownedName = `findit_test_${randomBytes(12).toString('hex')}`;
  const config = { ...configFromEnv(), database: ownedName };
  const connection = await connect(config, false);
  let created = false;
  try {
    // CREATE without IF NOT EXISTS proves ownership, even in the unlikely event of a name collision.
    await connection.query(`CREATE DATABASE ${quote(ownedName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await initialize(connection, ownedName);
    await t.test('empty database migrates and seeds with verified password hashes', async () => {
      assert.equal(await migrate(connection, ownedName), 11);
      await seed(connection, ownedName, credentials);
      await verifyMigrations(connection, ownedName);
      assert.deepEqual(await verifySeed(connection, ownedName, credentials), { roles: 2, users: 2, categories: 4, locations: 4, items: 4 });
    });
    await t.test('rerunning migrations and seed preserves every existing row', async () => {
      const before = await snapshot(connection);
      assert.equal(await migrate(connection, ownedName), 0);
      await seed(connection, ownedName, credentials);
      assert.deepEqual(await snapshot(connection), before);
    });
    await t.test('PK, NOT NULL, UNIQUE, FK, ENUM, JSON, CHECK and defaults are enforced', async () => {
      await connection.beginTransaction();
      try {
        const [[admin]] = await connection.query("SELECT u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.name='ADMIN'");
        const [[user]] = await connection.query("SELECT u.user_id, u.role_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.name='USER'");
        const [[lost]] = await connection.query("SELECT * FROM items WHERE type='LOST' ORDER BY item_id LIMIT 1");
        const [[found]] = await connection.query("SELECT * FROM items WHERE type='FOUND' ORDER BY item_id LIMIT 1");
        const now = new Date();
        const valid = {
          roles: { name: 'EXTRA' }, categories: { name: 'Integration category' }, locations: { name: 'Integration location' },
          users: { role_id: user.role_id, full_name: 'Constraint test', email: 'constraints@example.test', password_hash: 'unused-test-hash', created_at: now, updated_at: now },
          items: { user_id: user.user_id, category_id: lost.category_id, location_id: lost.location_id, title: 'Constraint test', description: 'Test', type: 'LOST', event_date: '2026-10-15', created_at: now, updated_at: now },
          item_images: { item_id: found.item_id, image_url: 'https://example.test/image.jpg', created_at: now },
          matches: { lost_item_id: lost.item_id, found_item_id: found.item_id, match_score: 80, reasons: JSON.stringify(['Cùng danh mục']), created_at: now },
          claims: { claimant_id: user.user_id, item_id: found.item_id, proof_description: 'Private test evidence', submitted_at: now },
          notifications: { user_id: user.user_id, type: 'NEW_MATCH', message: 'Test', created_at: now },
          activity_logs: { user_id: admin.user_id, action: 'TEST', entity_type: 'ITEM', entity_id: found.item_id, details: JSON.stringify({ test: true }), created_at: now }
        };
        for (const [name, row] of Object.entries(valid)) await insert(connection, name, row);
        const [[claim]] = await connection.query('SELECT claim_id FROM claims LIMIT 1');
        valid.reports = { reporter_id: user.user_id, target_type: 'ITEM', item_id: found.item_id, reason: 'Test', created_at: now };
        await insert(connection, 'reports', valid.reports);
        // Every primary key and every non-auto-increment NOT NULL column.
        for (const table of tables) {
          await rejectCode(() => connection.query(`INSERT INTO ${quote(table.name)} SELECT * FROM ${quote(table.name)} LIMIT 1`), [1062]);
          for (const [column, definition] of Object.entries(table.columns)) {
            if (definition.includes('NOT NULL') && !definition.includes('AUTO_INCREMENT')) {
              await rejectCode(() => insert(connection, table.name, { ...valid[table.name], [column]: null }), [1048]);
            }
          }
          for (const columns of Object.values(table.unique ?? {})) {
            if (columns.includes('student_code')) {
              await connection.execute("UPDATE users SET student_code='UNIQUE-TEST' WHERE user_id=?", [user.user_id]);
              await rejectCode(() => insert(connection, 'users', { ...valid.users, email: 'another@example.test', student_code: 'UNIQUE-TEST' }), [1062]);
            } else await rejectCode(() => insert(connection, table.name, valid[table.name]), [1062]);
          }
          for (const relation of Object.values(table.foreign ?? {})) {
            const row = { ...valid[table.name], [relation.column]: '18446744073709551614' };
            if (table.name === 'users') row.email = 'badfk@example.test';
            if (table.name === 'reports') {
              row.item_id = null; row.reported_user_id = null; row.claim_id = null;
              if (relation.column === 'item_id') { row.target_type = 'ITEM'; row.item_id = '18446744073709551614'; }
              else if (relation.column === 'reported_user_id') { row.target_type = 'USER'; row.reported_user_id = '18446744073709551614'; }
              else if (relation.column === 'claim_id') { row.target_type = 'CLAIM'; row.claim_id = '18446744073709551614'; }
              else { row.target_type = 'ITEM'; row.item_id = found.item_id; }
            }
            await rejectCode(() => insert(connection, table.name, row), [1452]);
          }
          for (const [column, definition] of Object.entries(table.columns)) {
            if (definition.startsWith('ENUM')) await rejectCode(() => insert(connection, table.name, { ...valid[table.name], [column]: 'INVALID' }), [1265]);
          }
        }
        // Different LOST/FOUND pair avoids the existing unique match pair.
        const [[otherLost]] = await connection.query("SELECT item_id FROM items WHERE type='LOST' AND item_id<>? LIMIT 1", [lost.item_id]);
        for (const score of [-0.01, 100.01]) await rejectCode(() => insert(connection, 'matches', { ...valid.matches, lost_item_id: otherLost.item_id, match_score: score }), [3819]);
        await rejectCode(() => insert(connection, 'matches', { ...valid.matches, found_item_id: lost.item_id }), [3819]);
        for (const score of [0, 100]) {
          await insert(connection, 'matches', { ...valid.matches, lost_item_id: otherLost.item_id, match_score: score });
          await connection.execute('DELETE FROM matches WHERE lost_item_id=?', [otherLost.item_id]);
        }
        await rejectCode(() => insert(connection, 'matches', { ...valid.matches, lost_item_id: otherLost.item_id, reasons: 'invalid-json' }), [3140]);
        for (const badTarget of [
          { item_id: null }, { reported_user_id: user.user_id }, { target_type: 'USER' },
          { target_type: 'CLAIM', item_id: null }, { target_type: 'USER', item_id: null, claim_id: claim.claim_id }
        ]) await rejectCode(() => insert(connection, 'reports', { ...valid.reports, ...badTarget }), [3819]);
        await insert(connection, 'reports', { ...valid.reports, target_type: 'USER', item_id: null, reported_user_id: user.user_id });
        await insert(connection, 'reports', { ...valid.reports, target_type: 'CLAIM', item_id: null, claim_id: claim.claim_id });
        await rejectCode(() => connection.execute('DELETE FROM items WHERE item_id=?', [found.item_id]), [1451]);
        await rejectCode(() => connection.execute('DELETE FROM users WHERE user_id=?', [user.user_id]), [1451]);
        const [[defaults]] = await connection.query('SELECT status FROM claims LIMIT 1');
        assert.equal(defaults.status, 'PENDING');
        const [[notification]] = await connection.query('SELECT is_read FROM notifications LIMIT 1');
        assert.equal(notification.is_read, 0);
      } finally { await connection.rollback(); }
    });
    await t.test('seed collision rolls back and never changes an existing password or role', async () => {
      const before = await snapshot(connection);
      await assert.rejects(() => seed(connection, ownedName, { ...credentials, USER: { ...credentials.USER, password: 'different-password-for-test' } }), /conflicts/);
      assert.deepEqual(await snapshot(connection), before);
    });
    await t.test('interrupted DDL is reconciled only when its table matches', async () => {
      const files = await migrationFiles();
      const last = files.at(-1);
      await connection.execute("UPDATE _schema_migrations SET status='running', applied_at=NULL WHERE version=?", [last.version]);
      assert.equal(await migrate(connection, ownedName), 1);
      // Failure before CREATE: safely recreate only the absent table tracked as running.
      await connection.query('DROP TABLE activity_logs');
      await connection.execute("UPDATE _schema_migrations SET status='running', applied_at=NULL WHERE version=?", [last.version]);
      assert.equal(await migrate(connection, ownedName), 1);
      await connection.execute('UPDATE _schema_migrations SET checksum=REPEAT(\'0\',64) WHERE version=?', [last.version]);
      await assert.rejects(() => migrate(connection, ownedName), /history\/checksum/);
      await connection.execute('UPDATE _schema_migrations SET checksum=? WHERE version=?', [last.checksum, last.version]);
      await connection.query('ALTER TABLE activity_logs ADD COLUMN unexpected INT NULL');
      await assert.rejects(() => migrate(connection, ownedName), /Schema mismatch/);
      await connection.query('ALTER TABLE activity_logs DROP COLUMN unexpected');
      await verifyMigrations(connection, ownedName);
    });
    await t.test('cleanup guard rejects application and unowned database names', () => {
      assert.throws(() => assertTestDatabase('findit_db', ownedName), /Refusing/);
      assert.throws(() => assertTestDatabase('findit_test_' + 'a'.repeat(24), ownedName), /Refusing/);
    });
  } finally {
    try {
      if (created) {
        assertTestDatabase(ownedName, ownedName);
        await connection.query(`DROP DATABASE ${quote(ownedName)}`);
      }
    } finally { await connection.end(); }
  }
});
