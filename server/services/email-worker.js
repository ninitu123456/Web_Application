import { randomUUID } from 'node:crypto';
import { query, transaction, databaseTimeout } from '../config/db.js';
import { matchEmail } from './mail.service.js';

export const retryDelay = attempts => Math.min(3600, 30 * 2 ** (attempts - 1));
export function createEmailWorker(pool, mailer) {
  return {
    async tick() {
      if (!mailer.configured) return false;
      const lease = randomUUID();
      const job = await transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        await run("UPDATE email_outbox SET status=IF(attempts>=5,'FAILED','PENDING'), lease_token=NULL, lease_until=NULL WHERE status='PROCESSING' AND lease_until<UTC_TIMESTAMP()");
        const [[job]] = await run("SELECT * FROM email_outbox WHERE status='PENDING' AND attempts<5 AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY job_id LIMIT 1 FOR UPDATE SKIP LOCKED");
        if (!job) return;
        await run("UPDATE email_outbox SET status='PROCESSING', attempts=attempts+1, lease_token=?, lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE job_id=?", [lease, job.job_id]);
        return { ...job, attempts: job.attempts + 1 };
      });
      if (!job) return false;
      try {
        const [[user]] = await query(pool, "SELECT email FROM users WHERE user_id=? AND account_status='ACTIVE'", [job.user_id]);
        if (!user) throw Object.assign(new Error('Unavailable recipient'), { code: 'INVALID_RECIPIENT' });
        const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
        await mailer.send({ to: user.email, ...matchEmail(payload, mailer.frontendUrl), messageId: `<findit-match-${job.job_id}@${new URL(mailer.frontendUrl).hostname}>` });
        await query(pool, "UPDATE email_outbox SET status='SENT',sent_at=UTC_TIMESTAMP(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE job_id=? AND lease_token=?", [job.job_id, lease]);
      } catch (error) {
        const code = ['INVALID_RECIPIENT', 'EMAIL_UNAVAILABLE', 'EMAIL_TIMEOUT', 'RESEND_RATE_LIMIT', 'RESEND_AUTH', 'RESEND_REJECTED', 'RESEND_FAILED'].includes(error.code) ? error.code : 'SEND_FAILED';
        const delay = Math.max(retryDelay(job.attempts), Number.isFinite(error.retryAfter) ? Math.min(86400, Math.max(0, error.retryAfter)) : 0);
        await query(pool, "UPDATE email_outbox SET status=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),last_error=?,lease_token=NULL,lease_until=NULL WHERE job_id=? AND lease_token=?", [job.attempts >= 5 || code === 'INVALID_RECIPIENT' || error.permanent ? 'FAILED' : 'PENDING', delay, code, job.job_id, lease]);
      }
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
