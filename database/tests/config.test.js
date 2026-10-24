import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configFromEnv, seedConfig } from '../scripts/config.js';
import { migrationFiles } from '../scripts/migrate.js';
import { normalizeCheck } from '../scripts/verify.js';
import { tables, metadata, createTable, quote } from '../schema.js';

test('connection refuses missing credentials and an unexpected application database', () => {
  assert.throws(() => configFromEnv({}), /Missing DB_USER/);
  assert.throws(() => configFromEnv({ DB_USER: 'test', DB_PASSWORD: '', DB_NAME: 'production' }), /DB_NAME/);
  assert.throws(() => configFromEnv({ DB_USER: 'test', DB_PASSWORD: '', DB_PORT: '-1' }), /DB_PORT/);
  assert.equal(configFromEnv({ DB_USER: 'test', DB_PASSWORD: '' }).database, 'findit_db');
  assert.throws(() => quote('name`; DROP DATABASE anything'), /identifier/);
});
test('seed credentials are mandatory, distinct, and within bcrypt byte limit', () => {
  assert.throws(() => seedConfig({}), /Missing/);
  const env = { SEED_ADMIN_EMAIL: 'admin@example.test', SEED_USER_EMAIL: 'user@example.test',
    SEED_ADMIN_PASSWORD: 'a'.repeat(16), SEED_USER_PASSWORD: 'b'.repeat(16) };
  assert.equal(seedConfig(env).USER.email, env.SEED_USER_EMAIL);
  assert.throws(() => seedConfig({ ...env, SEED_USER_EMAIL: env.SEED_ADMIN_EMAIL }), /different/);
  assert.throws(() => seedConfig({ ...env, SEED_USER_PASSWORD: 'đ'.repeat(40) }), /72/);
});
test('committed migrations and SQL export match the physical schema source', async () => {
  const files = await migrationFiles();
  assert.equal(files.length, 11);
  const sql = await readFile(new URL('../database-schema.sql', import.meta.url), 'utf8');
  for (const table of [...tables, metadata]) assert.ok(sql.includes(createTable(table)), table.name);
});
test('CHECK comparison accepts MySQL formatting and preserves AND/OR precedence', () => {
  assert.equal(normalizeCheck("target_type = 'ITEM' AND item_id IS NOT NULL"),
    normalizeCheck("((`target_type` = _utf8mb4\\'ITEM\\') and (`item_id` is not null))"));
  assert.notEqual(normalizeCheck('a = 1 AND (b = 2 OR c = 3)'), normalizeCheck('(a = 1 AND b = 2) OR c = 3'));
  assert.throws(() => normalizeCheck('a = 1; DROP TABLE items'), /Unsupported|Trailing/);
});
