import { transaction, databaseTimeout } from '../config/db.js';
import { matchingTransaction } from '../services/matching-transaction.js';
import { HttpError } from '../utils/http-error.js';
import { createItemRepository } from './item.repository.js';
import { createNotificationRepository } from './notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';
import { businessActions, businessEntities } from '../utils/admin-dto.js';
import { bumpAiVisualCatalogRevision } from '../ai-visual/catalog-revision.js';

const summaryColumns = 'c.claim_id,c.item_id,c.claimant_id,c.status,c.submitted_at,c.reviewed_at,c.completed_at';
export function createAdminModerationRepository(pool) {
  return {
    // Matching advisory lock precedes BEGIN. F07 locks role exclusively then
    // users; moderation shares role then actor. Owner paths: Item -> Claims.
    // Image writes/cleanup lock Item only, cursor scan is independent.
    // Lookup/report writers never wait for Items. All FK user locks are shared.
    withActor(identity, matching, operation) {
      return (matching ? matchingTransaction : transaction)(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[role]] = await run("SELECT role_id FROM roles WHERE name='ADMIN' FOR SHARE");
        const [[actor]] = await run('SELECT role_id,account_status FROM users WHERE user_id=? FOR SHARE', [identity.id]);
        if (!role || !actor || String(actor.role_id) !== String(role.role_id) || actor.account_status !== 'ACTIVE') throw new HttpError(403, 'Quyền quản trị không còn hiệu lực');
        return operation({
          run, items: createItemRepository(pool, run),
          bumpVisualCatalog() { return bumpAiVisualCatalogRevision(run); },
          async lockItem(id) { const [[item]] = await run('SELECT item_id,user_id,type,status FROM items WHERE item_id=? FOR UPDATE', [id]); return item; },
          async lockClaims(id) { const [rows] = await run(`SELECT ${summaryColumns} FROM claims c WHERE c.item_id=? ORDER BY c.claim_id FOR UPDATE`, [id]); return rows; },
          async audit(action, entityType, entityId, details) {
            const [result] = await run('INSERT INTO activity_logs(user_id,action,entity_type,entity_id,details,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())', [identity.id, action, entityType, entityId, JSON.stringify(details)]);
            return String(result.insertId);
          },
          async notify(events) {
            events.sort((a, b) => BigInt(a.userId) < BigInt(b.userId) ? -1 : BigInt(a.userId) > BigInt(b.userId) ? 1 : a.type.localeCompare(b.type) || Number(a.id) - Number(b.id));
            const service = createNotificationService(createNotificationRepository(pool, run));
            for (const event of events) await service.emit(event.type, event.id, [event.userId]);
          }
        });
      });
    },
    async findClaimItemId(source, id) { const [[row]] = await source.run('SELECT item_id FROM claims WHERE claim_id=?', [id]); return row?.item_id; },
    async listClaims(source, options) {
      const where = [], values = [];
      for (const [field, column] of [['status', 'c.status'], ['itemId', 'c.item_id'], ['claimantId', 'c.claimant_id']]) if (options[field] !== undefined) { where.push(`${column}=?`); values.push(options[field]); }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[count]] = await source.run(`SELECT COUNT(*) AS total FROM claims c${clause}`, values);
      const order = options.sort === 'oldest' ? 'ASC' : 'DESC';
      const [rows] = await source.run(`SELECT ${summaryColumns},i.user_id AS item_user_id,i.title AS item_title,i.type AS item_type,i.status AS item_status FROM claims c JOIN items i ON i.item_id=c.item_id${clause} ORDER BY c.submitted_at ${order},c.claim_id ${order} LIMIT ? OFFSET ?`, [...values, options.limit, (options.page - 1) * options.limit]);
      return { rows, total: count.total };
    },
    async activityLogs(source, options) {
      const where = [`action IN (${businessActions.map(() => '?').join(',')})`, `entity_type IN (${businessEntities.map(() => '?').join(',')})`], values = [...businessActions, ...businessEntities];
      for (const [field, column] of [['action', 'action'], ['entityType', 'entity_type'], ['entityId', 'entity_id'], ['actorId', 'user_id']]) if (options[field] !== undefined) { where.push(`${column}=?`); values.push(options[field]); }
      if (options.dateFrom) { where.push('created_at>=?'); values.push(`${options.dateFrom} 00:00:00`); }
      if (options.dateTo) { where.push('created_at<=?'); values.push(`${options.dateTo} 23:59:59`); }
      const clause = ` WHERE ${where.join(' AND ')}`;
      const [[count]] = await source.run(`SELECT COUNT(*) AS total FROM activity_logs${clause}`, values);
      const order = options.sort === 'oldest' ? 'ASC' : 'DESC';
      const [rows] = await source.run(`SELECT log_id,user_id,action,entity_type,entity_id,details,created_at FROM activity_logs${clause} ORDER BY created_at ${order},log_id ${order} LIMIT ? OFFSET ?`, [...values, options.limit, (options.page - 1) * options.limit]);
      return { rows, total: count.total };
    }
  };
}
