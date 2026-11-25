import { query, transaction, databaseTimeout } from '../config/db.js';
import { hiddenItemSql } from '../utils/item-visibility.js';
import { createItemRepository } from './item.repository.js';

const VIEW_WINDOW_MINUTES = 30;
export function createEngagementRepository(pool) {
  const execute = (sql, values = []) => query(pool, sql, values);
  const items = createItemRepository(pool);
  return {
    async findItem(itemId) {
      const [[row]] = await execute(`SELECT i.item_id, i.user_id, i.type, i.status, ${hiddenItemSql()} AS is_hidden FROM items i WHERE i.item_id = ?`, [itemId]);
      return row;
    },
    async save(userId, itemId) {
      await execute('INSERT IGNORE INTO saved_items (user_id, item_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [userId, itemId]);
    },
    async unsave(userId, itemId) {
      const [result] = await execute('DELETE FROM saved_items WHERE user_id = ? AND item_id = ?', [userId, itemId]);
      return result.affectedRows;
    },
    async savedIds(userId) {
      const [rows] = await execute(`SELECT s.item_id FROM saved_items s JOIN items i ON i.item_id = s.item_id WHERE s.user_id = ? AND ${hiddenItemSql()} = 0 ORDER BY s.created_at DESC, s.saved_id DESC LIMIT 500`, [userId]);
      return rows.map((row) => row.item_id);
    },
    async listSaved(userId, options) {
      const visible = `s.user_id = ? AND ${hiddenItemSql()} = 0`;
      const [[count]] = await execute(`SELECT COUNT(*) AS total FROM saved_items s JOIN items i ON i.item_id = s.item_id WHERE ${visible}`, [userId]);
      const [rows] = await execute(`SELECT s.item_id, s.created_at FROM saved_items s JOIN items i ON i.item_id = s.item_id WHERE ${visible} ORDER BY s.created_at DESC, s.saved_id DESC LIMIT ? OFFSET ?`, [userId, options.limit, (options.page - 1) * options.limit]);
      const result = [];
      for (const row of rows) {
        const item = await items.findById(row.item_id);
        if (item) result.push({ ...item, saved_at: row.created_at });
      }
      return { rows: result, total: Number(count.total) };
    },
    // A view counts once per viewer per window; the owner never counts.
    async recordView(itemId, viewerKey) {
      return transaction(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        await run('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [itemId]);
        const [[recent]] = await run(`SELECT view_id FROM item_views WHERE item_id = ? AND viewer_key = ? AND viewed_at > UTC_TIMESTAMP() - INTERVAL ${VIEW_WINDOW_MINUTES} MINUTE LIMIT 1`, [itemId, viewerKey]);
        if (recent) return false;
        await run('INSERT INTO item_views (item_id, viewer_key, viewed_at) VALUES (?, ?, UTC_TIMESTAMP())', [itemId, viewerKey]);
        return true;
      });
    },
    async itemStats(itemId) {
      const [[row]] = await execute(`SELECT
        (SELECT COUNT(*) FROM item_views WHERE item_id = ?) AS views,
        (SELECT COUNT(*) FROM saved_items WHERE item_id = ?) AS saves,
        (SELECT COUNT(*) FROM claims WHERE item_id = ?) AS claims,
        (SELECT COUNT(*) FROM claims WHERE item_id = ? AND status = 'PENDING') AS pending_claims`, [itemId, itemId, itemId, itemId]);
      return row;
    },
    async userStats(userId) {
      const [[posts]] = await execute(`SELECT COUNT(*) AS total,
        COALESCE(SUM(type = 'LOST'), 0) AS lost, COALESCE(SUM(type = 'FOUND'), 0) AS found,
        COALESCE(SUM(status IN ('OPEN','CLAIM_PENDING')), 0) AS active, COALESCE(SUM(status = 'RETURNED'), 0) AS returned
        FROM items WHERE user_id = ?`, [userId]);
      const [[claims]] = await execute(`SELECT COUNT(*) AS sent, COALESCE(SUM(status = 'PENDING'), 0) AS pending,
        COALESCE(SUM(status = 'APPROVED'), 0) AS approved, COALESCE(SUM(status = 'COMPLETED'), 0) AS completed
        FROM claims WHERE claimant_id = ?`, [userId]);
      const [[incoming]] = await execute("SELECT COUNT(*) AS pending FROM claims c JOIN items i ON i.item_id = c.item_id WHERE i.user_id = ? AND c.status = 'PENDING'", [userId]);
      const [[views]] = await execute('SELECT COUNT(*) AS total FROM item_views v JOIN items i ON i.item_id = v.item_id WHERE i.user_id = ?', [userId]);
      const [[saved]] = await execute(`SELECT COUNT(*) AS total FROM saved_items s JOIN items i ON i.item_id = s.item_id WHERE s.user_id = ? AND ${hiddenItemSql()} = 0`, [userId]);
      return { posts, claims, incoming, views, saved };
    },
    async createContact(userId, input) {
      const [result] = await execute('INSERT INTO contact_messages (user_id, full_name, email, topic, body, item_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, \'NEW\', UTC_TIMESTAMP())',
        [userId ?? null, input.fullName, input.email, input.topic, input.body, input.itemUrl ?? null]);
      const [[row]] = await execute('SELECT * FROM contact_messages WHERE contact_id = ?', [result.insertId]);
      return row;
    },
    async listContacts(options) {
      const where = options.status ? 'WHERE status = ?' : '', values = options.status ? [options.status] : [];
      const [[count]] = await execute(`SELECT COUNT(*) AS total FROM contact_messages ${where}`, values);
      const [rows] = await execute(`SELECT * FROM contact_messages ${where} ORDER BY created_at DESC, contact_id DESC LIMIT ? OFFSET ?`, [...values, options.limit, (options.page - 1) * options.limit]);
      return { rows, total: count.total };
    },
    async handleContact(contactId, adminId) {
      return transaction(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[row]] = await run('SELECT contact_id, status FROM contact_messages WHERE contact_id = ? FOR UPDATE', [contactId]);
        if (!row) return undefined;
        if (row.status === 'NEW') {
          await run("UPDATE contact_messages SET status = 'HANDLED', handled_at = UTC_TIMESTAMP(), handled_by = ? WHERE contact_id = ?", [adminId, contactId]);
          await run("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, 'CONTACT_HANDLED', 'CONTACT', ?, ?, UTC_TIMESTAMP())", [adminId, contactId, JSON.stringify({})]);
        }
        const [[updated]] = await run('SELECT * FROM contact_messages WHERE contact_id = ?', [contactId]);
        return updated;
      });
    },
    async listDisputes(options) {
      const where = options.status === 'RESOLVED' ? 'h.dispute_resolved_at IS NOT NULL' : 'h.dispute_resolved_at IS NULL';
      const [[count]] = await execute(`SELECT COUNT(*) AS total FROM claim_handovers h WHERE h.disputed_at IS NOT NULL AND ${where}`);
      const [rows] = await execute(`SELECT h.*, c.item_id, c.claimant_id, c.status AS claim_status, i.title AS item_title, i.user_id AS owner_id,
        owner.full_name AS owner_name, claimant.full_name AS claimant_name, disputer.full_name AS disputer_name
        FROM claim_handovers h JOIN claims c ON c.claim_id = h.claim_id JOIN items i ON i.item_id = c.item_id
        JOIN users owner ON owner.user_id = i.user_id JOIN users claimant ON claimant.user_id = c.claimant_id
        LEFT JOIN users disputer ON disputer.user_id = h.disputed_by
        WHERE h.disputed_at IS NOT NULL AND ${where} ORDER BY h.disputed_at DESC, h.claim_id DESC LIMIT ? OFFSET ?`, [options.limit, (options.page - 1) * options.limit]);
      return { rows, total: count.total };
    },
    async resolveDispute(claimId, adminId) {
      return transaction(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[row]] = await run('SELECT claim_id, disputed_at, dispute_resolved_at FROM claim_handovers WHERE claim_id = ? FOR UPDATE', [claimId]);
        if (!row || !row.disputed_at) return undefined;
        if (!row.dispute_resolved_at) {
          await run('UPDATE claim_handovers SET dispute_resolved_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP() WHERE claim_id = ?', [claimId]);
          await run("INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, 'HANDOVER_DISPUTE_RESOLVED', 'CLAIM', ?, ?, UTC_TIMESTAMP())", [adminId, claimId, JSON.stringify({})]);
        }
        return true;
      });
    }
  };
}
