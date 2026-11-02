import { assertIsolatedInstance, assertOwnedDatabase } from '../../database/scripts/assert-isolated.js';
await assertIsolatedInstance();
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createClaimRepository } from '../repositories/claim.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createMatchingRepository } from '../repositories/matching.repository.js';
import { createMatchingService } from '../services/matching.service.js';
import { serve } from './helpers.js';

test('F09: bounded Claim/Match HTTP lists, snapshots and EXPLAIN on isolated data', { timeout: 30000 }, async (t) => {
  const name = `findit_test_${randomBytes(12).toString('hex')}`, base = configFromEnv();
  const setup = await connect(base, false); let pool, http, created = false;
  try {
    await setup.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await setup.query(`USE \`${name}\``); await migrate(setup, name);
    await seed(setup, name, { USER: { email: 'owner@pages.test', password: randomBytes(24).toString('hex') }, ADMIN: { email: 'admin@pages.test', password: randomBytes(24).toString('hex') } });
    pool = createDbPool({ ...base, database: name });
    const [[owner]] = await query(pool, "SELECT user_id AS id,role_id FROM users WHERE email='owner@pages.test'");
    const [[category]] = await query(pool, 'SELECT category_id AS id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id AS id FROM locations LIMIT 1');
    const item = async (type) => {
      const [row] = await query(pool, "INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at) VALUES(?,?,?,'Page fixture','Page fixture',?,'2026-10-20','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())", [owner.id, category.id, location.id, type]);
      return Number(row.insertId);
    };
    const found = await item('FOUND'), lost = await item('LOST'), users = [], items = [];
    for (let i = 0; i < 120; i++) {
      const [user] = await query(pool, "INSERT INTO users(role_id,full_name,email,password_hash,account_status,created_at,updated_at) VALUES(?,'Claimant',?,'fixture','ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())", [owner.role_id, `claimant${i}@pages.test`]);
      users.push(String(user.insertId)); items.push(await item('FOUND'));
      await query(pool, "INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at) VALUES(?,?,'PRIVATE_PAGE_PROOF','PENDING','2026-10-20 00:00:00')", [users[i], found]);
      await query(pool, "INSERT INTO matches(lost_item_id,found_item_id,match_score,reasons,status,created_at) VALUES(?,?,80,JSON_ARRAY('Same score'),'POTENTIAL',UTC_TIMESTAMP())", [lost, items[i]]);
    }
    for (const id of items) await query(pool, "INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at) VALUES(?,?,'PRIVATE_PAGE_PROOF','PENDING','2026-10-20 00:00:00')", [users[0], id]);
    const claimService = createClaimService(createClaimRepository(pool)), matchingService = createMatchingService(createMatchingRepository(pool));
    http = await serve({ healthService: { check() {} }, authService: { async authenticate(token) { return { id: token === 'owner' ? owner.id : token === 'other' ? users[1] : users[0], role: 'USER' }; } }, userService: {}, itemService: {}, claimService, matchingService });
    const get = async (path, token = 'claimant') => {
      const response = await fetch(http.url + path, { headers: { Authorization: 'Bearer ' + token } });
      return { status: response.status, body: await response.json() };
    };
    await t.test('three lists default to ten and exhaustive pages preserve tie ordering, total and privacy', async () => {
      for (const [path, token, total, key, direction] of [[`/api/items/${found}/claims`, 'owner', 120, 'id', -1], ['/api/claims/mine', 'claimant', 121, 'id', -1], [`/api/items/${lost}/matches`, 'other', 120, 'matchId', 1]]) {
        const first = await get(path, token); assert.equal(first.status, 200); assert.equal(first.body.data.length, 10);
        assert.deepEqual(first.body.pagination, { page: 1, limit: 10, total, totalPages: Math.ceil(total / 10) });
        const rows = [];
        for (let page = 1; page <= Math.ceil(total / 100); page++) rows.push(...(await get(path + `?page=${page}&limit=100`, token)).body.data);
        assert.equal(rows.length, total); assert.equal(new Set(rows.map((row) => row[key])).size, total);
        assert.deepEqual(rows.map((row) => row[key]), rows.map((row) => row[key]).sort((a, b) => direction * (a - b)));
        assert.deepEqual((await get(path + '?page=999&limit=100', token)).body.data, []);
        if (key === 'matchId') assert.ok(!JSON.stringify(rows).includes('PRIVATE_PAGE_PROOF'));
        else assert.ok(rows.every((row) => row.proofDescription === 'PRIVATE_PAGE_PROOF'));
      }
      assert.equal((await get(`/api/items/${found}/claims`, 'other')).status, 403);
      assert.equal((await get('/api/items/9007199254740991/matches')).status, 404);
    });
    await t.test('count/page keep a snapshot across concurrent INSERT and pool isolation remains unchanged', async () => {
      const leased = await pool.getConnection();
      await leased.query('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
      let inserted = false;
      const extra = await item('FOUND');
      const wrapper = { async getConnection() { return new Proxy(leased, { get(target, key) {
        if (key === 'release') return () => {};
        if (key === 'query') return async (statement, values) => {
          const result = await target.query(statement, values);
          if (/SELECT COUNT/.test(statement.sql) && !inserted) {
            inserted = true;
            await query(pool, "INSERT INTO claims(claimant_id,item_id,proof_description,status,submitted_at) VALUES(?,?,'NEW','PENDING',UTC_TIMESTAMP())", [users[0], extra]);
          }
          return result;
        };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }); } };
      try {
        const result = await createClaimRepository(wrapper).listMine(users[0], { page: 1, limit: 100 });
        assert.equal(Number(result.total), 121); assert.equal(result.rows.length, 100);
        assert.ok(!result.rows.some((row) => Number(row.item_id) === extra));
        const [[session]] = await leased.query('SELECT @@session.transaction_isolation AS isolation');
        assert.equal(session.isolation, 'READ-COMMITTED');
        assert.equal((await claimService.mine({ id: users[0] })).pagination.total, 122);
      } finally { await leased.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ'); leased.release(); }
    });
    await t.test('Match COUNT/page retain the same visibility snapshot during concurrent close', async () => {
      let closed = false;
      const wrapper = { async getConnection() {
        const real = await pool.getConnection();
        return new Proxy(real, { get(target, key) {
          if (key === 'query') return async (statement, values) => {
            const result = await target.query(statement, values);
            if (/SELECT COUNT/.test(statement.sql) && !closed) {
              closed = true; await query(pool, "UPDATE items SET status='CLOSED' WHERE item_id=?", [items[0]]);
            }
            return result;
          };
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      try {
        const result = await createMatchingRepository(wrapper).list(lost, { page: 1, limit: 100 });
        assert.equal(Number(result.total), 120);
        assert.ok(result.rows.some((row) => Number(row.itemId) === items[0]));
        assert.equal((await matchingService.list(lost)).pagination.total, 119);
      } finally { await query(pool, "UPDATE items SET status='OPEN' WHERE item_id=?", [items[0]]); }
    });
    await t.test('T5: record plans and bounded-query timings without creating indexes', async () => {
      const statements = [];
      const wrapper = { async getConnection() { const real = await pool.getConnection(); return new Proxy(real, { get(target, key) {
        if (key === 'query') return (statement, values) => { if (/^SELECT/.test(statement.sql)) statements.push({ sql: statement.sql, values }); return target.query(statement, values); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } }); } };
      await createClaimRepository(wrapper).listMine(users[0], { page: 1, limit: 100 });
      await createClaimService(createClaimRepository(wrapper)).forItem({ id: owner.id, role: 'USER' }, found, { page: 1, limit: 100 });
      await createMatchingRepository(wrapper).list(lost, { page: 1, limit: 100 });
      for (const statement of statements.filter(({ sql }) => /COUNT|LIMIT/.test(sql))) {
        const [plan] = await query(pool, 'EXPLAIN ' + statement.sql, statement.values);
        const start = performance.now(); await query(pool, statement.sql, statement.values);
        console.log('F09 EXPLAIN', JSON.stringify({ kind: /COUNT/.test(statement.sql) ? 'count' : 'page', ms: +(performance.now() - start).toFixed(2), plan: plan.map(({ table, key, rows, Extra }) => ({ table, key, rows, Extra })) }));
        assert.ok(plan.length > 0);
      }
    });
  } finally {
    if (http) await http.close(); if (pool) await pool.end();
    try { if (created) { assertOwnedDatabase(name, name); await setup.query(`DROP DATABASE \`${name}\``); } }
    finally { await setup.end(); }
  }
});
