import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
import { configFromEnv } from '../../database/scripts/config.js';
import { connect } from '../../database/scripts/connection.js';
import { migrate } from '../../database/scripts/migrate.js';
import { seed } from '../../database/seeds/sample.js';
import { createDbPool, query } from '../config/db.js';
import { createEmailWorker } from '../services/email-worker.js';
import { createMailer } from '../services/mail.service.js';
await assertIsolatedInstance();

test(
  'email acquisition barrier: concurrent recovery/claim does not lose jobs or repeat provider sends',
  { timeout: 30000 },
  async () => {
    const base = configFromEnv(),
      name = 'findit_test_' + randomBytes(12).toString('hex');
    const admin = await connect(base, false);
    let pool,
      created = false,
      releaseBarrier = () => {};
    try {
      await admin.query('CREATE DATABASE ' + name + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
      created = true;
      await admin.query('USE ' + name);
      await migrate(admin, name);
      const password = randomBytes(18).toString('hex');
      await seed(admin, name, {
        USER: { email: 'user@barrier.example.test', password },
        ADMIN: { email: 'admin@barrier.example.test', password },
      });
      pool = createDbPool({ ...base, database: name });
      const [match] = await query(
        pool,
        "INSERT INTO matches(lost_item_id,found_item_id,match_score,status,created_at) VALUES(1,2,100,'POTENTIAL',UTC_TIMESTAMP())",
      );
      const [owners] = await query(pool, 'SELECT user_id FROM items WHERE item_id IN (1,2) ORDER BY item_id');
      for (const owner of owners)
        await query(
          pool,
          "INSERT INTO email_outbox(user_id,event_key,payload,status,next_attempt_at,created_at) VALUES(?,?,?,'PENDING',UTC_TIMESTAMP(),UTC_TIMESTAMP())",
          [owner.user_id, 'MATCH:' + match.insertId, JSON.stringify({ fixture: 'barrier' })],
        );
      await query(
        pool,
        "UPDATE email_outbox SET status='PROCESSING',attempts=1,lease_until=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND),payload=? WHERE job_id=1",
        [JSON.stringify({ emailDelivery: { version: 1, prepared: false, outcome: 'NOT_SENT' } })],
      );
      let arrivals = 0,
        release,
        acquired;
      const gate = new Promise((resolve) => {
        release = resolve;
        releaseBarrier = resolve;
      });
      const ready = new Promise((resolve) => {
        acquired = resolve;
      });
      const wrapped = {
        async getConnection() {
          const c = await pool.getConnection();
          return new Proxy(c, {
            get(target, key) {
              if (key === 'query')
                return async (...args) => {
                  const result = await target.query(...args);
                  const sql = typeof args[0] === 'string' ? args[0] : args[0].sql;
                  if (
                    sql.startsWith("SELECT * FROM email_outbox WHERE status='PENDING'") &&
                    arrivals++ === 0
                  ) {
                    acquired();
                    await gate;
                  }
                  return result;
                };
              const value = target[key];
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
      };
      const calls = [];
      const mailer = createMailer(
        {
          RESEND_API_KEY: 'local-fixture-only',
          EMAIL_FROM: 'FindIt <sender@barrier.example.test>',
          FRONTEND_URL: 'https://findit.example.test',
        },
        async (_url, options) => {
          calls.push(options.headers['Idempotency-Key']);
          return Response.json({ id: 'accepted-' + calls.length });
        },
      );
      const worker = createEmailWorker(wrapped, mailer);
      const first = worker.tick();
      first.catch(() => {});
      let readyTimer;
      try {
        await Promise.race([
          ready,
          new Promise((_, reject) => {
            readyTimer = setTimeout(() => reject(new Error('Acquisition barrier was not reached')), 5000);
          }),
        ]);
      } finally {
        clearTimeout(readyTimer);
      }
      const second = worker.tick();
      second.catch(() => {});
      let waiting = false;
      const until = Date.now() + 1500;
      while (Date.now() < until) {
        const [[locks]] = await admin.query('SELECT COUNT(*) n FROM performance_schema.data_lock_waits');
        if (Number(locks.n)) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      release();
      const outcomes = await Promise.allSettled([first, second]);
      console.log('EMAIL_BARRIER_WAIT', JSON.stringify({ waiting, arrivals }));
      const errors = outcomes.filter((result) => result.status === 'rejected').map((result) => result.reason);
      if (errors.length) {
        const [[status]] = await admin.query('SHOW ENGINE INNODB STATUS');
        await mkdir('.cache/email-concurrency', { recursive: true });
        await writeFile('.cache/email-concurrency/deadlock.txt', status.Status);
        console.log(
          'EMAIL_BARRIER_EVIDENCE',
          JSON.stringify({ arrivals, codes: errors.map((e) => e.code), errno: errors.map((e) => e.errno) }),
        );
      }
      assert.equal(waiting, true, 'Controlled recovery/claim contention was observed');
      assert.deepEqual(
        errors.map((e) => e.code),
        [],
      );
      assert.equal(calls.length, 2);
      assert.equal(new Set(calls).size, 2);
      await worker.tick();
      assert.equal(calls.length, 2);
      const [[count]] = await query(pool, "SELECT COUNT(*) n FROM email_outbox WHERE status='SENT'");
      assert.equal(Number(count.n), 2);
    } finally {
      releaseBarrier();
      await pool?.end();
      try {
        if (created) await admin.query('DROP DATABASE ' + name);
      } finally {
        await admin.end();
      }
    }
  },
);
