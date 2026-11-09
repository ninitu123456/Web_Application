import { query, transaction, databaseTimeout } from '../config/db.js';
import { lockActiveAdmin } from './admin-actor.js';

const columns = 'report_id, reporter_id, target_type, item_id, reported_user_id, claim_id, reason, description, status, reviewed_by, reviewed_at, created_at';
export function createReportRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  return {
    withTransaction(operation) {
      return transaction(pool, (connection) => operation(createReportRepository(pool, (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values))));
    },
    async target(type, id) {
      if (type === 'CLAIM') {
        const [[row]] = await execute('SELECT c.claimant_id, i.user_id FROM claims c JOIN items i ON i.item_id=c.item_id WHERE c.claim_id=?', [id]);
        return row;
      }
      const sql = type === 'ITEM' ? 'SELECT item_id FROM items WHERE item_id=?' : 'SELECT user_id FROM users WHERE user_id=?';
      const [[row]] = await execute(sql, [id]); return row;
    },
    async create(reporterId, input) {
      await execute("INSERT INTO reports (reporter_id, target_type, item_id, reported_user_id, claim_id, reason, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', UTC_TIMESTAMP())", [reporterId, input.targetType,
        input.targetType === 'ITEM' ? input.targetId : null, input.targetType === 'USER' ? input.targetId : null, input.targetType === 'CLAIM' ? input.targetId : null, input.reason, input.description ?? null]);
      const [[row]] = await execute(`SELECT ${columns} FROM reports WHERE report_id=LAST_INSERT_ID()`); return row;
    },
    async list(reporterId, options) {
      const where = [], values = [];
      if (reporterId != null) { where.push('reporter_id=?'); values.push(reporterId); }
      if (options.status) { where.push('status=?'); values.push(options.status); }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[count]] = await execute(`SELECT COUNT(*) AS total FROM reports${clause}`, values);
      const [rows] = await execute(`SELECT ${columns} FROM reports${clause} ORDER BY created_at DESC, report_id DESC LIMIT ? OFFSET ?`, [...values, options.limit, (options.page - 1) * options.limit]);
      return { rows, total: count.total };
    },
    async findById(id) { const [[row]] = await execute(`SELECT ${columns} FROM reports WHERE report_id=?`, [id]); return row; },
    async findForUpdate(id) { const [[row]] = await execute(`SELECT ${columns} FROM reports WHERE report_id=? FOR UPDATE`, [id]); return row; },
    async update(id, from, to, reviewerId) {
      await lockActiveAdmin(execute, reviewerId);
      const [result] = await execute('UPDATE reports SET status=?, reviewed_by=?, reviewed_at=UTC_TIMESTAMP() WHERE report_id=? AND status=?', [to, reviewerId, id, from]); return result.affectedRows;
    },
    async audit(actorId, id, from, to) {
      await execute("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, 'REPORT_STATUS_CHANGED', 'REPORT', ?, ?, UTC_TIMESTAMP())", [actorId, id, JSON.stringify({ previousStatus: from, status: to })]);
    }
  };
}
