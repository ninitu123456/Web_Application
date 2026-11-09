import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createAdminService } from '../services/admin.service.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createItemService } from '../services/item.service.js';
import { createReportRepository } from '../repositories/report.repository.js';
import { createReportService } from '../services/report.service.js';

test('legacy admin mutations revalidate the actor inside the write transaction', { timeout: 90000 }, async t => {
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const connection = await connect(base, false);
  let created = false, pool;
  try {
    await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await connection.query(`USE \`${name}\``); await migrate(connection, name);
    const password = randomBytes(18).toString('hex');
    await seed(connection, name, { USER: { email: 'owner@actor.test', password }, ADMIN: { email: 'admin@actor.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [users] = await query(pool, 'SELECT u.user_id,r.name AS role FROM users u JOIN roles r ON r.role_id=u.role_id');
    const actor = role => ({ id: String(users.find(row => row.role === role).user_id), role });
    const admin = actor('ADMIN'), owner = actor('USER');
    const items = createItemService(createItemRepository(pool));
    const service = createAdminService(createAdminRepository(pool), items);
    const reports = createReportService(createReportRepository(pool));
    const [[item]] = await query(pool, 'SELECT item_id FROM items WHERE user_id=? AND status=\'OPEN\' LIMIT 1', [owner.id]);
    const report = await reports.create(owner, { targetType: 'ITEM', targetId: Number(item.item_id), reason: 'SPAM' });
    const snapshot = async () => {
      const rows = {};
      for (const table of ['categories', 'locations', 'items', 'reports', 'activity_logs']) [rows[table]] = await query(pool, `SELECT * FROM \`${table}\``);
      return rows;
    };
    const denied = task => assert.rejects(task, error => error.status === 403);
    await query(pool, "UPDATE users SET account_status='SUSPENDED' WHERE user_id=?", [admin.id]);
    await t.test('suspended ADMIN cannot create, edit or deactivate either lookup kind', async () => {
      const before = await snapshot();
      for (const kind of ['categories', 'locations']) {
        const id = before[kind][0][kind === 'categories' ? 'category_id' : 'location_id'];
        await denied(() => service.createLookup(admin, kind, { name: 'Unauthorized lookup' }));
        await denied(() => service.updateLookup(admin, kind, id, { name: 'Unauthorized edit' }));
        await denied(() => service.updateLookup(admin, kind, id, {}, true));
      }
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('suspended ADMIN cannot process a Report', async () => {
      const before = await snapshot();
      await denied(() => reports.update(admin, report.id, { status: 'REVIEWING' }));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('suspended ADMIN cannot close an Item through the legacy path', async () => {
      const before = await snapshot();
      await denied(() => service.closeItem(admin, Number(item.item_id)));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('an ACTIVE USER with a stale ADMIN identity cannot mutate privileged records', async () => {
      const stale = { ...owner, role: 'ADMIN' }, before = await snapshot();
      await denied(() => service.createLookup(stale, 'categories', { name: 'Forged role' }));
      await denied(() => reports.update(stale, report.id, { status: 'REVIEWING' }));
      await denied(() => service.closeItem(stale, Number(item.item_id)));
      assert.deepEqual(await snapshot(), before);
    });
    await t.test('the same operations still work for a current ACTIVE ADMIN', async () => {
      await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [admin.id]);
      const category = await service.createLookup(admin, 'categories', { name: 'Authorized lookup' });
      await service.updateLookup(admin, 'categories', category.id, { name: 'Authorized edit' });
      await service.updateLookup(admin, 'categories', category.id, {}, true);
      assert.equal((await reports.update(admin, report.id, { status: 'REVIEWING' })).status, 'REVIEWING');
      assert.equal((await service.closeItem(admin, Number(item.item_id))).status, 'CLOSED');
    });
  } finally {
    await pool?.end();
    try { if (created) await connection.query(`DROP DATABASE \`${name}\``); } finally { await connection.end(); }
  }
});
