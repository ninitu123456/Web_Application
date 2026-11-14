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
import { createEmailWorker, emailRetryWindowMs } from '../services/email-worker.js';
import { createMailer } from '../services/mail.service.js';
import { createItemService } from '../services/item.service.js';
import { createItemRepository } from '../repositories/item.repository.js';
import { createAdminService } from '../services/admin.service.js';
import { createAdminRepository } from '../repositories/admin.repository.js';
import { createClaimService } from '../services/claim.service.js';
import { createClaimRepository } from '../repositories/claim.repository.js';

const mailEnv = { RESEND_API_KEY: 'synthetic-email-key', EMAIL_FROM: 'FindIt <sender@email.test>', FRONTEND_URL: 'https://frontend.email.test' };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Email barrier timed out')), 5000); })]); }
  finally { clearTimeout(timer); }
}
function barrierPool(pool, predicate) {
  const ready = deferred(), release = deferred(); let held = false;
  return { ready: ready.promise, release: release.resolve, pool: { async getConnection() {
    const connection = await pool.getConnection();
    return new Proxy(connection, { get(target, key) {
      if (key === 'query') return async (statement, values) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (!held && predicate(sql)) { held = true; ready.resolve(); await bounded(release.promise); }
        return target.query(statement, values);
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } } };
}
function faultPool(pool, inject, afterCommit) {
  return { async getConnection() {
    const connection = await pool.getConnection();
    return new Proxy(connection, { get(target, key) {
      if (key === 'commit' && afterCommit) return async () => { await target.commit(); await afterCommit(); };
      if (key === 'query') return async (statement, values) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        await inject(sql);
        return target.query(statement, values);
      };
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
}

test('Match email durable requests, dispatch barriers and lease recovery on disposable MySQL', { timeout: 120000 }, async t => {
  const base = configFromEnv(), name = 'findit_test_' + randomBytes(12).toString('hex');
  const setup = await connect(base, false); let pool, created = false;
  try {
    await setup.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); created = true;
    await setup.query(`USE \`${name}\``); await migrate(setup, name);
    const password = randomBytes(18).toString('hex');
    await seed(setup, name, { USER: { email: 'owner@email.test', password }, ADMIN: { email: 'admin@email.test', password } });
    pool = createDbPool({ ...base, database: name });
    const [users] = await query(pool, 'SELECT u.user_id,r.name AS role FROM users u JOIN roles r ON r.role_id=u.role_id');
    const identity = role => ({ id: String(users.find(row => row.role === role).user_id), role });
    const owner = identity('USER'), admin = identity('ADMIN');
    const items = createItemService(createItemRepository(pool));
    const admins = createAdminService(createAdminRepository(pool), items);
    const claims = createClaimService(createClaimRepository(pool));
    const [[category]] = await query(pool, 'SELECT category_id id FROM categories LIMIT 1');
    const [[location]] = await query(pool, 'SELECT location_id id FROM locations LIMIT 1');
    const row = async id => {
      const [[job]] = await query(pool, 'SELECT * FROM email_outbox WHERE job_id=?', [id]);
      return { ...job, payload: typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload };
    };
    const due = id => query(pool, 'UPDATE email_outbox SET next_attempt_at=UTC_TIMESTAMP() WHERE job_id=?', [id]);
    const scenario = async (title, body) => t.test(title, async subtest => {
      await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [owner.id]);
      const ids = [];
      for (const [index, type] of ['LOST', 'FOUND'].entries()) {
        const [saved] = await query(pool, `INSERT INTO items(user_id,category_id,location_id,title,description,type,event_date,status,created_at,updated_at)
          VALUES(?,?,?,?,'Synthetic email regression',?,'2026-11-09','OPEN',UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [index ? admin.id : owner.id, category.id, location.id, 'Current ' + type, type]);
        ids.push(String(saved.insertId));
      }
      const [match] = await query(pool, "INSERT INTO matches(lost_item_id,found_item_id,match_score,status,created_at) VALUES(?,?,80,'POTENTIAL',UTC_TIMESTAMP())", ids);
      const [job] = await query(pool, "INSERT INTO email_outbox(user_id,event_key,payload,status,next_attempt_at,created_at) VALUES(?,?,?,'PENDING',UTC_TIMESTAMP(),UTC_TIMESTAMP())",
        [owner.id, 'MATCH:' + match.insertId, JSON.stringify({ ownTitle: 'Queued title', title: 'Queued FOUND', itemId: ids[1], score: 50 })]);
      try { await body({ id: String(job.insertId), lost: ids[0], found: ids[1], match: String(match.insertId), subtest }); }
      finally {
        await query(pool, "UPDATE email_outbox SET status='FAILED' WHERE job_id=? AND status IN ('PENDING','PROCESSING')", [job.insertId]);
        await query(pool, "UPDATE users SET account_status='ACTIVE' WHERE user_id=?", [owner.id]);
      }
    });

    await scenario('lost provider response then edited Match replays the identical durable request with the same key', async f => {
      const requests = [], accepted = new Map();
      const provider = async (_url, options) => {
        const key = options.headers['Idempotency-Key']; requests.push({ key, body: options.body });
        const durable = (await row(f.id)).payload.emailDelivery;
        assert.equal(durable?.request?.body, options.body, 'exact request must be durable before HTTP');
        assert.equal(durable.request.idempotencyKey, key);
        assert.equal(durable.outcome, 'UNKNOWN');
        if (!accepted.has(key)) { accepted.set(key, options.body); throw new Error('Synthetic lost response after acceptance'); }
        return accepted.get(key) === options.body ? Response.json({ id: 'provider-email-1' }) : Response.json({ name: 'invalid_idempotent_request' }, { status: 409 });
      };
      await createEmailWorker(pool, createMailer(mailEnv, provider)).tick();
      assert.equal((await row(f.id)).status, 'PENDING');
      const saved = (await row(f.id)).payload.emailDelivery;
      assert.ok(saved?.request, 'request must be durable before the first provider call');
      assert.ok(!JSON.stringify(saved).includes(mailEnv.RESEND_API_KEY));
      await query(pool, 'UPDATE items SET title=? WHERE item_id=?', ['Edited after acceptance', f.lost]);
      await query(pool, 'UPDATE matches SET match_score=75 WHERE match_id=?', [f.match]);
      await due(f.id);
      const changed = createMailer(mailEnv, provider);
      await createEmailWorker(pool, changed).tick();
      assert.equal((await row(f.id)).status, 'SENT');
      assert.deepEqual(requests[1], requests[0]); assert.equal(accepted.size, 1);
      assert.deepEqual((await row(f.id)).payload.emailDelivery.request, saved.request);
    });

    await scenario('restart with changed sender and frontend URL cannot change a frozen request or key', async f => {
      const requests = [];
      const provider = async (_url, options) => {
        requests.push({ body: options.body, key: options.headers['Idempotency-Key'] });
        if (requests.length === 1) throw new Error('Synthetic ambiguous delivery');
        return Response.json({ id: 'same-request-id' });
      };
      await createEmailWorker(pool, createMailer(mailEnv, provider)).tick(); await due(f.id);
      await createEmailWorker(pool, createMailer({ ...mailEnv, EMAIL_FROM: 'Changed <changed@email.test>', FRONTEND_URL: 'https://changed.email.test' }, provider)).tick();
      assert.deepEqual(requests[1], requests[0]); assert.equal((await row(f.id)).status, 'SENT');
    });

    for (const operation of ['hide', 'close', 'return', 'suspend']) {
      await scenario(`${operation} commits before dispatch authorization: no HTTP request`, async f => {
        let claim;
        if (operation === 'return') {
          claim = await claims.create(owner, Number(f.found), { proofDescription: 'Synthetic proof' });
          await claims.approve(admin, claim.id);
        }
        const barrier = barrierPool(pool, sql => sql === "SELECT role_id FROM roles WHERE name='ADMIN' FOR SHARE");
        let requests = 0;
        const worker = createEmailWorker(barrier.pool, createMailer(mailEnv, async () => { requests++; return Response.json({ id: 'unexpected' }); }));
        const task = worker.tick();
        try {
          await bounded(barrier.ready);
          if (operation === 'hide') await admins.setItemVisibility(admin, Number(f.lost), { visibility: 'HIDDEN', reason: 'Synthetic email barrier' });
          if (operation === 'close') await items.close(owner, Number(f.lost));
          if (operation === 'return') await claims.complete(admin, claim.id);
          if (operation === 'suspend') await admins.setUserStatus(admin, Number(owner.id), 'SUSPENDED');
        } finally { barrier.release(); await task; }
        assert.equal(requests, 0);
        const job = await row(f.id);
        assert.equal(job.status, 'FAILED');
        assert.equal(job.last_error, operation === 'suspend' ? 'INVALID_RECIPIENT' : 'ITEM_UNAVAILABLE');
        assert.equal(job.payload.emailDelivery.outcome, 'NOT_SENT');
      });
    }

    await scenario('dispatch decision commits before HTTP; lifecycle changes during HTTP do not hold MySQL locks', async f => {
      const ready = deferred(), release = deferred();
      let requests = 0;
      const task = createEmailWorker(pool, createMailer(mailEnv, async () => {
        requests++; ready.resolve(); await bounded(release.promise); return Response.json({ id: 'accepted-before-hide' });
      })).tick();
      try {
        await bounded(ready.promise);
        assert.equal((await row(f.id)).payload.emailDelivery.outcome, 'UNKNOWN');
        const connection = await pool.getConnection();
        try {
          await connection.query('SET SESSION innodb_lock_wait_timeout=1');
          await connection.beginTransaction();
          await connection.query('SELECT item_id FROM items WHERE item_id=? FOR UPDATE', [f.lost]);
          await connection.query('SELECT job_id FROM email_outbox WHERE job_id=? FOR UPDATE', [f.id]);
          await connection.rollback();
        } finally { connection.release(); }
        await admins.setItemVisibility(admin, Number(f.lost), { visibility: 'HIDDEN', reason: 'After dispatch decision' });
      } finally { release.resolve(); await task; }
      assert.equal(requests, 1);
      const job = await row(f.id);
      assert.equal(job.status, 'SENT'); assert.equal(job.payload.emailDelivery.outcome, 'ACCEPTED');
    });

    await scenario('suspension waits for an already locked dispatch decision, then commits without a deadlock', async f => {
      const barrier = barrierPool(pool, sql => sql === 'SELECT item_id FROM items WHERE item_id=? FOR UPDATE');
      let requests = 0;
      const task = createEmailWorker(barrier.pool, createMailer(mailEnv, async () => { requests++; return Response.json({ id: 'authorized-first' }); })).tick();
      let suspension;
      try {
        await bounded(barrier.ready);
        suspension = admins.setUserStatus(admin, Number(owner.id), 'SUSPENDED');
        // Inspect the real wait on this disposable schema, not an arbitrary sleep.
        let waiting = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          const [[state]] = await query(pool, `SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
            JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE
            WHERE l.OBJECT_SCHEMA=? AND l.OBJECT_NAME='roles'`, [name]);
          if (Number(state.n)) { waiting = true; break; }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, true, 'suspension must wait for the dispatch role lock');
      } finally { barrier.release(); await task; await suspension; }
      assert.equal(requests, 1); assert.equal((await row(f.id)).status, 'SENT');
      const [[user]] = await query(pool, 'SELECT account_status FROM users WHERE user_id=?', [owner.id]);
      assert.equal(user.account_status, 'SUSPENDED');
    });

    await scenario('lease takeover before final send gate fences the old worker without changing the snapshot', async f => {
      const barrier = barrierPool(pool, sql => sql.startsWith('UPDATE email_outbox SET lease_until='));
      const requests = [];
      const mailer = createMailer(mailEnv, async (_url, options) => { requests.push(options.body); return Response.json({ id: 'new-owner' }); });
      const stale = createEmailWorker(barrier.pool, mailer).tick();
      let frozen;
      try {
        await bounded(barrier.ready); frozen = (await row(f.id)).payload.emailDelivery.request;
        await query(pool, 'UPDATE email_outbox SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE job_id=?', [f.id]);
        await createEmailWorker(pool, mailer).tick();
      } finally { barrier.release(); await stale; }
      assert.equal(requests.length, 1);
      const job = await row(f.id);
      assert.equal(job.status, 'SENT'); assert.deepEqual(job.payload.emailDelivery.request, frozen);
    });

    await scenario('takeover during HTTP handles concurrent idempotency and reconciles one provider acceptance', async f => {
      const ready = deferred(), release = deferred(), requests = []; let accepted = false, deliveries = 0;
      const mailer = createMailer(mailEnv, async (_url, options) => {
        requests.push({ body: options.body, key: options.headers['Idempotency-Key'] });
        if (requests.length === 1) { ready.resolve(); await bounded(release.promise); accepted = true; deliveries++; }
        else if (!accepted) return Response.json({ name: 'concurrent_idempotent_requests' }, { status: 409 });
        return Response.json({ id: 'one-provider-message' });
      });
      const stale = createEmailWorker(pool, mailer).tick();
      try {
        await bounded(ready.promise);
        await query(pool, 'UPDATE email_outbox SET lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE job_id=?', [f.id]);
        await createEmailWorker(pool, mailer).tick();
        const pending = await row(f.id);
        assert.equal(pending.status, 'PENDING'); assert.equal(pending.last_error, 'RESEND_IDEMPOTENCY_PENDING');
        assert.equal(pending.payload.emailDelivery.outcome, 'UNKNOWN');
      } finally { release.resolve(); await stale; }
      assert.equal((await row(f.id)).status, 'PENDING', 'stale worker must not overwrite the new lease result');
      await due(f.id); await createEmailWorker(pool, mailer).tick();
      assert.equal((await row(f.id)).status, 'SENT'); assert.equal(deliveries, 1);
      assert.equal(requests.length, 3); assert.ok(requests.every(request => JSON.stringify(request) === JSON.stringify(requests[0])));
    });

    await scenario('heartbeat detects a lost lease and aborts an in-flight transport without a stale DB write', async f => {
      const ready = deferred(), aborted = deferred(); let requests = 0;
      const mailer = createMailer(mailEnv, async (_url, options) => {
        requests++; ready.resolve();
        return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { aborted.resolve(); reject(new Error('Synthetic abort')); }, { once: true }));
      });
      const task = createEmailWorker(pool, mailer, { heartbeatMs: 20 }).tick();
      await bounded(ready.promise);
      await query(pool, 'UPDATE email_outbox SET lease_token=? WHERE job_id=?', [randomBytes(18).toString('hex'), f.id]);
      await bounded(aborted.promise); await task;
      const job = await row(f.id);
      assert.equal(requests, 1); assert.equal(job.status, 'PROCESSING'); assert.equal(job.payload.emailDelivery.outcome, 'UNKNOWN');
    });

    for (const uncertain of [false, true]) {
      await scenario(`retry deadline prevents sending after the retention window; prior uncertainty=${uncertain}`, async f => {
        let requests = 0;
        const mailer = createMailer(mailEnv, async () => {
          requests++;
          if (uncertain) throw new Error('Lost provider response');
          return Response.json({ message: 'limited' }, { status: 429 });
        });
        const worker = createEmailWorker(pool, mailer); await worker.tick();
        const job = await row(f.id), snapshot = job.payload.emailDelivery;
        snapshot.firstDispatchAt = Date.now() - 25 * 60 * 60 * 1000;
        snapshot.retryUntil = snapshot.firstDispatchAt + emailRetryWindowMs;
        await query(pool, 'UPDATE email_outbox SET payload=? WHERE job_id=?', [JSON.stringify(job.payload), f.id]);
        await due(f.id); await worker.tick();
        const stopped = await row(f.id);
        assert.equal(requests, 1); assert.equal(stopped.status, 'FAILED'); assert.equal(stopped.last_error, 'EMAIL_RETRY_WINDOW_EXPIRED');
        assert.equal(stopped.payload.emailDelivery.outcome, uncertain ? 'UNKNOWN' : 'NOT_SENT');
      });
    }

    for (const uncertain of [false, true]) {
      await scenario(`five attempts exhaust retries without a sixth request; uncertainty=${uncertain}`, async f => {
        const requests = [];
        const worker = createEmailWorker(pool, createMailer(mailEnv, async (_url, options) => {
          requests.push({ body: options.body, key: options.headers['Idempotency-Key'] });
          if (uncertain) throw new Error('Synthetic unknown delivery on every attempt');
          return Response.json({}, { status: 429 });
        }));
        let frozen;
        for (let attempt = 1; attempt <= 5; attempt++) {
          await due(f.id); await worker.tick();
          const job = await row(f.id);
          frozen ??= job.payload.emailDelivery.request;
          assert.equal(job.attempts, attempt);
          assert.equal(job.status, attempt === 5 ? 'FAILED' : 'PENDING');
          assert.equal(job.payload.emailDelivery.outcome, uncertain ? 'UNKNOWN' : 'NOT_SENT');
          assert.deepEqual(job.payload.emailDelivery.request, frozen);
          assert.equal(job.lease_token, null); assert.equal(job.lease_until, null);
        }
        const exhausted = await row(f.id);
        await due(f.id); assert.equal(await worker.tick(), false);
        const stopped = await row(f.id);
        assert.equal(requests.length, 5);
        assert.ok(requests.every(request => request.body === frozen.body && request.key === frozen.idempotencyKey));
        assert.equal(stopped.status, 'FAILED'); assert.equal(stopped.attempts, 5);
        assert.equal(stopped.last_error, uncertain ? 'RESEND_FAILED' : 'RESEND_RATE_LIMIT');
        assert.deepEqual(stopped.payload, exhausted.payload);
      });
    }

    await scenario('legacy attempted rows without a snapshot stop as UNKNOWN instead of reconstructing a new body', async f => {
      let requests = 0;
      await query(pool, 'UPDATE email_outbox SET attempts=1 WHERE job_id=?', [f.id]);
      await createEmailWorker(pool, createMailer(mailEnv, async () => { requests++; return Response.json({ id: 'unexpected' }); })).tick();
      const job = await row(f.id);
      assert.equal(requests, 0); assert.equal(job.status, 'FAILED'); assert.equal(job.last_error, 'EMAIL_LEGACY_UNKNOWN');
      assert.equal(job.payload.emailDelivery.outcome, 'UNKNOWN');
    });

    await scenario('invalid idempotency is terminal and does not invent a new key', async f => {
      let requests = 0;
      const worker = createEmailWorker(pool, createMailer(mailEnv, async () => { requests++; return Response.json({ name: 'invalid_idempotent_request', message: 'private provider data' }, { status: 409 }); }));
      await worker.tick(); await worker.tick();
      const job = await row(f.id);
      assert.equal(requests, 1); assert.equal(job.status, 'FAILED'); assert.equal(job.last_error, 'RESEND_IDEMPOTENCY_CONFLICT');
      assert.equal(job.payload.emailDelivery.outcome, 'UNKNOWN'); assert.ok(!JSON.stringify(job).includes('private provider data'));
    });

    await scenario('definitive rejection after a lost response never downgrades UNKNOWN to NOT_SENT', async f => {
      let calls = 0;
      const worker = createEmailWorker(pool, createMailer(mailEnv, async () => {
        if (++calls === 1) throw new Error('Ambiguous provider acceptance');
        return Response.json({ name: 'validation_error' }, { status: 422 });
      }));
      await worker.tick(); await due(f.id); await worker.tick();
      const job = await row(f.id);
      assert.equal(job.status, 'FAILED'); assert.equal(job.last_error, 'RESEND_REJECTED'); assert.equal(job.payload.emailDelivery.outcome, 'UNKNOWN');
    });

    await scenario('fresh definitive rejection is NOT_SENT', async f => {
      await createEmailWorker(pool, createMailer(mailEnv, async () => Response.json({ name: 'validation_error' }, { status: 422 }))).tick();
      assert.equal((await row(f.id)).payload.emailDelivery.outcome, 'NOT_SENT');
    });

    await scenario('accepted jobs cannot be resent or downgraded by resetting attempts or expiring a lease', async f => {
      let requests = 0;
      const worker = createEmailWorker(pool, createMailer(mailEnv, async () => { requests++; return Response.json({ id: 'already-accepted' }); }));
      await worker.tick();
      await query(pool, "UPDATE email_outbox SET status='PENDING',attempts=0,next_attempt_at=UTC_TIMESTAMP() WHERE job_id=?", [f.id]);
      await worker.tick(); assert.equal((await row(f.id)).status, 'SENT');
      await query(pool, "UPDATE email_outbox SET status='PROCESSING',attempts=5,lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE job_id=?", [f.id]);
      await worker.tick();
      assert.equal(requests, 1); assert.equal((await row(f.id)).status, 'SENT');
    });

    await scenario('SQL failure before snapshot persistence is NOT_SENT and can prepare safely on retry', async f => {
      let injected = false, requests = 0;
      const broken = faultPool(pool, async sql => {
        if (!injected && sql.startsWith('UPDATE email_outbox SET payload=')) {
          injected = true; throw Object.assign(new Error('Synthetic SQL failure'), { code: 'ER_SIGNAL_EXCEPTION' });
        }
      });
      const mailer = createMailer(mailEnv, async () => { requests++; return Response.json({ id: 'first-actual-request' }); });
      await createEmailWorker(broken, mailer).tick();
      const prepared = await row(f.id);
      assert.equal(requests, 0); assert.equal(prepared.status, 'PENDING');
      assert.equal(prepared.payload.emailDelivery.outcome, 'NOT_SENT'); assert.equal(prepared.payload.emailDelivery.prepared, false);
      await due(f.id); await createEmailWorker(pool, mailer).tick();
      assert.equal(requests, 1); assert.equal((await row(f.id)).status, 'SENT');
    });

    await scenario('provider acceptance followed by SQL failure stays UNKNOWN and replays one accepted message', async f => {
      let injected = false, requests = 0, deliveries = 0, original;
      const broken = faultPool(pool, async sql => {
        if (!injected && sql.startsWith("UPDATE email_outbox SET status='SENT',payload=")) {
          injected = true; throw Object.assign(new Error('Synthetic result persistence failure'), { code: 'ER_SIGNAL_EXCEPTION' });
        }
      });
      const mailer = createMailer(mailEnv, async (_url, options) => {
        requests++;
        const request = { body: options.body, key: options.headers['Idempotency-Key'] };
        if (!original) { original = request; deliveries++; } else assert.deepEqual(request, original);
        return Response.json({ id: 'accepted-despite-sql-failure' });
      });
      await createEmailWorker(broken, mailer).tick();
      assert.equal((await row(f.id)).status, 'PENDING'); assert.equal((await row(f.id)).payload.emailDelivery.outcome, 'UNKNOWN');
      await due(f.id); await createEmailWorker(pool, mailer).tick();
      assert.equal((await row(f.id)).status, 'SENT'); assert.equal(requests, 2); assert.equal(deliveries, 1);
    });

    await scenario('retry-after beyond the safe window stops without guessing delivery', async f => {
      let requests = 0;
      await createEmailWorker(pool, createMailer(mailEnv, async () => { requests++; return Response.json({}, { status: 429, headers: { 'retry-after': '86400' } }); })).tick();
      const job = await row(f.id);
      assert.equal(requests, 1); assert.equal(job.status, 'FAILED'); assert.equal(job.last_error, 'EMAIL_RETRY_WINDOW_EXPIRED');
      assert.equal(job.payload.emailDelivery.outcome, 'NOT_SENT');
    });

    await scenario('an old never-attempted queued event starts its retention clock at first dispatch', async f => {
      await query(pool, 'UPDATE email_outbox SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY) WHERE job_id=?', [f.id]);
      await createEmailWorker(pool, createMailer(mailEnv, async () => Response.json({ id: 'new-first-attempt' }))).tick();
      const job = await row(f.id);
      assert.equal(job.status, 'SENT'); assert.ok(Math.abs(Date.now() - job.payload.emailDelivery.firstDispatchAt) < 10000);
    });

    await scenario('a corrupted snapshot is rejected instead of regenerating a body or fetching an arbitrary URL', async f => {
      let requests = 0;
      const worker = createEmailWorker(pool, createMailer(mailEnv, async () => { requests++; throw new Error('Unknown outcome'); }));
      await worker.tick();
      const job = await row(f.id); job.payload.emailDelivery.request.url = 'https://untrusted.invalid';
      await query(pool, 'UPDATE email_outbox SET payload=? WHERE job_id=?', [JSON.stringify(job.payload), f.id]);
      await due(f.id); await worker.tick();
      const stopped = await row(f.id);
      assert.equal(requests, 1); assert.equal(stopped.status, 'FAILED'); assert.equal(stopped.last_error, 'EMAIL_SNAPSHOT_INVALID');
      assert.equal(stopped.payload.emailDelivery.outcome, 'UNKNOWN');
    });

    await scenario('unknown prior delivery followed by hide stops without claiming the email was never sent', async f => {
      let requests = 0;
      const worker = createEmailWorker(pool, createMailer(mailEnv, async () => { requests++; throw new Error('Lost acceptance response'); }));
      await worker.tick();
      await admins.setItemVisibility(admin, Number(f.lost), { visibility: 'HIDDEN', reason: 'After ambiguous delivery' });
      await due(f.id); await worker.tick();
      const job = await row(f.id);
      assert.equal(requests, 1); assert.equal(job.status, 'FAILED'); assert.equal(job.last_error, 'ITEM_UNAVAILABLE');
      assert.equal(job.payload.emailDelivery.outcome, 'UNKNOWN');
    });

    for (const lostCommit of [2, 3]) {
      await scenario(`lost COMMIT response at ${lostCommit === 2 ? 'dispatch authorization' : 'accepted result'} preserves one request`, async f => {
        let commits = 0, requests = 0;
        const broken = faultPool(pool, async () => {}, async () => {
          if (++commits === lostCommit) throw Object.assign(new Error('Synthetic lost COMMIT acknowledgement'), { code: 'ECONNRESET', fatal: true });
        });
        const mailer = createMailer(mailEnv, async () => { requests++; return Response.json({ id: 'committed-provider-result' }); });
        await createEmailWorker(broken, mailer).tick();
        const first = await row(f.id), request = first.payload.emailDelivery.request;
        if (lostCommit === 2) {
          assert.equal(requests, 0, 'HTTP must not run until authorization COMMIT is acknowledged');
          assert.equal(first.status, 'PENDING'); assert.equal(first.payload.emailDelivery.outcome, 'UNKNOWN');
          await due(f.id);
        } else {
          assert.equal(first.status, 'SENT'); assert.equal(first.payload.emailDelivery.outcome, 'ACCEPTED');
        }
        await createEmailWorker(pool, mailer).tick();
        const final = await row(f.id);
        assert.equal(requests, 1); assert.equal(final.status, 'SENT'); assert.deepEqual(final.payload.emailDelivery.request, request);
      });
    }
  } finally {
    await pool?.end();
    try { if (created) await setup.query(`DROP DATABASE \`${name}\``); } finally { await setup.end(); }
  }
});
