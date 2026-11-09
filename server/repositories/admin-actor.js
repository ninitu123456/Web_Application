import { HttpError } from '../utils/http-error.js';

// Share the role -> actor lock order with moderation and account suspension.
// A middleware identity can become stale while waiting for a transaction.
export async function lockActiveAdmin(run, actorId) {
  const [[role]] = await run("SELECT role_id FROM roles WHERE name='ADMIN' FOR SHARE");
  const [[actor]] = await run('SELECT role_id,account_status FROM users WHERE user_id=? FOR SHARE', [actorId]);
  if (!role || !actor || String(actor.role_id) !== String(role.role_id) || actor.account_status !== 'ACTIVE') {
    throw new HttpError(403, 'Quyền quản trị không còn hiệu lực');
  }
}
