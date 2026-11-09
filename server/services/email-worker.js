import { randomUUID } from 'node:crypto';
import { query, transaction, databaseTimeout } from '../config/db.js';
import { matchEmail, validateMailRequest } from './mail.service.js';
import { hiddenItemSql } from '../utils/item-visibility.js';

export const retryDelay = attempts => Math.min(3600, 30 * 2 ** (attempts - 1));
// Resend retains keys for 24h. Stop an hour early, including across restarts.
export const emailRetryWindowMs = 23 * 60 * 60 * 1000;
const payloadOf = value => typeof value === 'string' ? JSON.parse(value) : value;
const knownErrors = new Set(['ITEM_UNAVAILABLE', 'INVALID_RECIPIENT', 'EMAIL_UNAVAILABLE', 'EMAIL_TIMEOUT',
  'RESEND_RATE_LIMIT', 'RESEND_AUTH', 'RESEND_REJECTED', 'RESEND_FAILED', 'RESEND_IDEMPOTENCY_CONFLICT',
  'RESEND_IDEMPOTENCY_PENDING', 'EMAIL_LEASE_LOST', 'EMAIL_RETRY_WINDOW_EXPIRED', 'EMAIL_SNAPSHOT_INVALID', 'EMAIL_LEGACY_UNKNOWN']);

export function createEmailWorker(pool, mailer, { heartbeatMs = 30000 } = {}) {
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs < 1 || heartbeatMs > 60000) throw new Error('Invalid email lease heartbeat');
  async function renew(job, lease) {
    const [result] = await query(pool, `UPDATE email_outbox SET lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)
      WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND lease_until>UTC_TIMESTAMP()`, [job.job_id, lease]);
    return result.affectedRows === 1;
  }
  async function stop(run, job, payload, code, outcome) {
    payload.emailDelivery = { ...payload.emailDelivery, version: 1, outcome };
    await run("UPDATE email_outbox SET status='FAILED',payload=?,last_error=?,lease_token=NULL,lease_until=NULL WHERE job_id=? AND lease_token=? AND lease_until>UTC_TIMESTAMP()",
      [JSON.stringify(payload), code, job.job_id, job.lease_token]);
  }
  async function authorize(job, lease) {
    const matchId = /^MATCH:([1-9]\d*)$/.exec(job.event_key)?.[1];
    // Discovery must not establish a stale RR read view inside the transaction.
    const [[pair]] = matchId ? await query(pool, 'SELECT lost_item_id,found_item_id FROM matches WHERE match_id=?', [matchId]) : [[]];
    return transaction(pool, async connection => {
      const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
      // Account-status writers and moderation: role -> user -> numeric Items ->
      // Match -> outbox. Queue claiming never waits for any of these Item locks.
      await run("SELECT role_id FROM roles WHERE name='ADMIN' FOR SHARE");
      const [[user]] = await run('SELECT email,account_status FROM users WHERE user_id=? FOR SHARE', [job.user_id]);
      if (pair) for (const id of [...new Set([String(pair.lost_item_id), String(pair.found_item_id)])].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1)) {
        await run('SELECT item_id FROM items WHERE item_id=? FOR UPDATE', [id]);
      }
      const [[match]] = pair ? await run(`SELECT m.match_score,l.user_id AS lost_owner,
        l.item_id AS lost_id,l.title AS lost_title,f.item_id AS found_id,f.title AS found_title,
        l.type AS lost_type,f.type AS found_type,l.status AS lost_status,f.status AS found_status,f.user_id AS found_owner
        FROM matches m JOIN items l ON l.item_id=m.lost_item_id JOIN items f ON f.item_id=m.found_item_id
        WHERE m.match_id=? FOR SHARE`, [matchId]) : [[]];
      const [[current]] = await run("SELECT *,UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000 AS now_ms FROM email_outbox WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND lease_until>UTC_TIMESTAMP() FOR UPDATE", [job.job_id, lease]);
      if (!current) return;
      const payload = payloadOf(current.payload), record = payload.emailDelivery;
      // A failed preparation is durably known not to have invoked HTTP. It can
      // prepare a first request later, unlike an untracked legacy attempt.
      const unprepared = record?.version === 1 && record.prepared === false && record.outcome === 'NOT_SENT' && !record.request;
      const previous = unprepared ? undefined : record;
      const priorOutcome = record?.outcome ?? (Number(current.attempts) > 1 ? 'UNKNOWN' : 'NOT_SENT');
      const fail = code => stop(run, current, payload, code, priorOutcome === 'NOT_SENT' ? 'NOT_SENT' : 'UNKNOWN');
      if (previous?.outcome === 'ACCEPTED') {
        await run("UPDATE email_outbox SET status='SENT',sent_at=COALESCE(sent_at,UTC_TIMESTAMP()),last_error=NULL,lease_token=NULL,lease_until=NULL WHERE job_id=? AND lease_token=?", [job.job_id, lease]);
        return;
      }
      if (previous) {
        try {
          validateMailRequest(previous.request, true);
          if (previous.version !== 1 || !['UNKNOWN', 'NOT_SENT'].includes(previous.outcome) ||
              !Number.isSafeInteger(previous.firstDispatchAt) || !Number.isSafeInteger(previous.retryUntil) ||
              previous.retryUntil !== previous.firstDispatchAt + emailRetryWindowMs) throw new Error('Invalid snapshot');
        } catch { await fail('EMAIL_SNAPSHOT_INVALID'); return; }
        if (Number(current.now_ms) >= previous.retryUntil || Number(current.now_ms) < previous.firstDispatchAt) { await fail('EMAIL_RETRY_WINDOW_EXPIRED'); return; }
      } else if (!unprepared && Number(current.attempts) > 1) {
        // Legacy attempts may have sent a body we can no longer reconstruct.
        await fail('EMAIL_LEGACY_UNKNOWN'); return;
      }
      if (!user || user.account_status !== 'ACTIVE') { await fail('INVALID_RECIPIENT'); return; }
      const active = status => ['OPEN', 'CLAIM_PENDING', 'CLAIMED'].includes(status);
      if (!match || match.lost_type !== 'LOST' || match.found_type !== 'FOUND' || String(match.lost_id) === String(match.found_id) ||
          !active(match.lost_status) || !active(match.found_status) || Number(match.match_score) < 50 ||
          ![String(match.lost_owner), String(match.found_owner)].includes(String(job.user_id))) {
        await fail('ITEM_UNAVAILABLE'); return;
      }
      // First consistent read after the Item locks observes prior moderation.
      const [visibility] = await run(`SELECT i.item_id,${hiddenItemSql()} AS is_hidden FROM items i WHERE i.item_id IN (?,?)`, [match.lost_id, match.found_id]);
      if (visibility.some(item => Number(item.is_hidden))) { await fail('ITEM_UNAVAILABLE'); return; }
      let delivery = previous;
      if (!delivery) {
        const own = String(match.lost_owner) === String(job.user_id);
        const message = { to: user.email, ...matchEmail({ ownTitle: own ? match.lost_title : match.found_title,
          title: own ? match.found_title : match.lost_title, itemId: String(own ? match.found_id : match.lost_id), score: Number(match.match_score) }, mailer.frontendUrl),
        messageId: `<findit-match-${job.job_id}@${new URL(mailer.frontendUrl).hostname}>` };
        const firstDispatchAt = Number(current.now_ms);
        delivery = { version: 1, request: mailer.prepare(message), firstDispatchAt, retryUntil: firstDispatchAt + emailRetryWindowMs };
      } else if (JSON.parse(delivery.request.body).to[0] !== user.email) {
        await fail('INVALID_RECIPIENT'); return;
      }
      // This COMMIT is the dispatch decision. HTTP runs afterward. Persist UNKNOWN
      // first: a crash after commit cannot prove the provider was never called.
      payload.emailDelivery = { ...delivery, outcome: 'UNKNOWN' };
      await run('UPDATE email_outbox SET payload=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE job_id=? AND lease_token=?', [JSON.stringify(payload), job.job_id, lease]);
      return { ...payload.emailDelivery, priorOutcome };
    });
  }
  async function failed(job, lease, error, dispatch) {
    const code = knownErrors.has(error.code) ? error.code : 'SEND_FAILED';
    await transaction(pool, async connection => {
      const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
      const [[current]] = await run("SELECT *,UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000 AS now_ms FROM email_outbox WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND lease_until>UTC_TIMESTAMP() FOR UPDATE", [job.job_id, lease]);
      if (!current) return;
      const payload = payloadOf(current.payload);
      const prior = dispatch?.priorOutcome ?? payload.emailDelivery?.outcome ?? (Number(current.attempts) > 1 ? 'UNKNOWN' : 'NOT_SENT');
      const outcome = prior === 'NOT_SENT' && (!dispatch || error.delivery === 'NOT_SENT') ? 'NOT_SENT' : 'UNKNOWN';
      payload.emailDelivery = { ...payload.emailDelivery, version: 1, outcome,
        ...(!payload.emailDelivery?.request ? { prepared: false } : {}) };
      const delay = Math.max(retryDelay(Number(current.attempts)), Number.isFinite(error.retryAfter) ? Math.min(86400, Math.max(0, error.retryAfter)) : 0);
      const expired = payload.emailDelivery.retryUntil !== undefined && Number(current.now_ms) + delay * 1000 >= payload.emailDelivery.retryUntil;
      const terminal = Number(current.attempts) >= 5 || error.permanent || expired || code === 'INVALID_RECIPIENT';
      await run("UPDATE email_outbox SET status=?,payload=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),last_error=?,lease_token=NULL,lease_until=NULL WHERE job_id=? AND lease_token=?",
        [terminal ? 'FAILED' : 'PENDING', JSON.stringify(payload), delay, expired ? 'EMAIL_RETRY_WINDOW_EXPIRED' : code, job.job_id, lease]);
    });
  }
  return {
    async tick() {
      if (!mailer.configured) return false;
      const lease = randomUUID();
      const job = await transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        await run(`UPDATE email_outbox SET status=CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(payload,'$.emailDelivery.outcome'))='ACCEPTED' THEN 'SENT' WHEN attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,
          sent_at=IF(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.emailDelivery.outcome'))='ACCEPTED',COALESCE(sent_at,UTC_TIMESTAMP()),sent_at),lease_token=NULL,lease_until=NULL,
          last_error=IF(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.emailDelivery.outcome'))='ACCEPTED',NULL,IF(attempts>=5,'EMAIL_ATTEMPTS_EXHAUSTED',last_error)),
          payload=IF(JSON_EXTRACT(payload,'$.emailDelivery') IS NULL,
            JSON_SET(payload,'$.emailDelivery',JSON_OBJECT('version',1,'outcome','UNKNOWN')),payload)
          WHERE (status='PROCESSING' AND lease_until<=UTC_TIMESTAMP()) OR (status='PENDING' AND attempts>=5)`);
        const [[job]] = await run("SELECT * FROM email_outbox WHERE status='PENDING' AND attempts<5 AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY job_id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!job) return;
        await run("UPDATE email_outbox SET status='PROCESSING',attempts=attempts+1,lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE job_id=?", [lease, job.job_id]);
        return job;
      });
      if (!job) return false;
      let dispatch, heartbeat, renewing = Promise.resolve();
      const abort = new AbortController();
      try {
        dispatch = await authorize(job, lease);
        if (!dispatch) return true;
        const beforeSend = () => renew(job, lease);
        if (!await beforeSend()) return true;
        let busy = false;
        heartbeat = setInterval(() => {
          if (busy) return;
          busy = true;
          renewing = renew(job, lease).then(ok => { if (!ok) abort.abort(); }, () => abort.abort()).finally(() => { busy = false; });
        }, heartbeatMs);
        heartbeat.unref();
        const body = JSON.parse(dispatch.request.body);
        const result = await mailer.send({ ...body, to: body.to[0], request: dispatch.request, notAfter: dispatch.retryUntil, beforeSend, signal: abort.signal });
        await transaction(pool, async connection => {
          const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
          const [[current]] = await run("SELECT payload FROM email_outbox WHERE job_id=? AND status='PROCESSING' AND lease_token=? AND lease_until>UTC_TIMESTAMP() FOR UPDATE", [job.job_id, lease]);
          if (!current) return;
          const payload = payloadOf(current.payload);
          payload.emailDelivery = { ...payload.emailDelivery, outcome: 'ACCEPTED', ...(result?.id ? { providerId: result.id } : {}) };
          await run("UPDATE email_outbox SET status='SENT',payload=?,sent_at=UTC_TIMESTAMP(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE job_id=? AND lease_token=?", [JSON.stringify(payload), job.job_id, lease]);
        });
      } catch (error) { await failed(job, lease, error, dispatch); }
      finally { clearInterval(heartbeat); await renewing; }
      return true;
    }
  };
}
export function startEmailWorker(worker) {
  let running = false, stopping = false, pending = Promise.resolve();
  const tick = () => {
    if (running || stopping) return;
    running = true;
    pending = worker.tick().catch(() => { console.error('email_worker_failed'); }).finally(() => { running = false; });
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return async () => { stopping = true; clearInterval(timer); await pending; };
}
