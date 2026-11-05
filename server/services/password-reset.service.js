import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { HttpError } from '../utils/http-error.js';
import { query, transaction, databaseTimeout } from '../config/db.js';

export const resetMessage = 'Nếu email phù hợp với tài khoản đang hoạt động, yêu cầu khôi phục sẽ được xử lý. Vui lòng kiểm tra hộp thư và thư rác.';
export const hashResetToken = token => createHash('sha256').update(token).digest('hex');
const unavailable = () => new HttpError(503, 'Dịch vụ email tạm thời chưa khả dụng. Vui lòng thử lại sau.');
const invalid = () => new HttpError(400, 'Liên kết không hợp lệ hoặc đã hết hạn');

export function createPasswordResetService(pool, mailer, onInvalidate = () => {}) {
  return {
    async forgot({ email }) {
      if (!mailer.configured) throw unavailable();
      // Atomic account throttle, including missing emails; no existence-dependent 429.
      const token = randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      let recipient;
      await transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[user]] = await run("SELECT user_id, email FROM users WHERE email=? AND account_status='ACTIVE' FOR UPDATE", [email]);
        if (!user) return;
        const [[recent]] = await run('SELECT token_hash FROM password_reset_tokens WHERE user_id=? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)', [user.user_id]);
        if (recent) return;
        await run('DELETE FROM password_reset_tokens WHERE user_id=?', [user.user_id]);
        await run('INSERT INTO password_reset_tokens (token_hash,user_id,expires_at,created_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE),UTC_TIMESTAMP())', [tokenHash, user.user_id]);
        recipient = user.email;
      });
      if (recipient) {
        try {
          // Fragment never reaches HTTP access logs/referrers. No plaintext token in queue/storage.
          const url = `${mailer.frontendUrl}/dat-lai-mat-khau#token=${token}`;
          await mailer.send({ to: recipient, subject: 'FindIt — Đặt lại mật khẩu',
            text: `Mở liên kết để đặt lại mật khẩu (hiệu lực 15 phút, dùng một lần):\n${url}\nNếu bạn không yêu cầu, hãy bỏ qua email này.` });
        } catch {
          await query(pool, 'UPDATE password_reset_tokens SET expires_at=UTC_TIMESTAMP() WHERE token_hash=?', [tokenHash]);
          // Same response for every account on provider failures; never claim delivery.
        }
      }
      return resetMessage;
    },
    async reset({ token, password }) {
      const hash = hashResetToken(token);
      const passwordHash = await bcrypt.hash(password, 12);
      const id = await transaction(pool, async connection => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[hint]] = await run('SELECT user_id FROM password_reset_tokens WHERE token_hash=?', [hash]);
        if (!hint) throw invalid();
        // Lock order is shared with forgot, so concurrent consume/rotate cannot deadlock.
        const [[user]] = await run("SELECT user_id FROM users WHERE user_id=? AND account_status='ACTIVE' FOR UPDATE", [hint.user_id]);
        const [[record]] = await run('SELECT user_id FROM password_reset_tokens WHERE token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE', [hash]);
        if (!user || !record) throw invalid();
        await run('UPDATE users SET password_hash=?, session_version=session_version+1, updated_at=UTC_TIMESTAMP() WHERE user_id=?', [passwordHash, user.user_id]);
        await run('DELETE FROM password_reset_tokens WHERE user_id=?', [user.user_id]);
        return String(user.user_id);
      });
      onInvalidate(id);
    }
  };
}
