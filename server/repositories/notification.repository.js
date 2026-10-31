import { query } from '../config/db.js';

export function createNotificationRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  return {
    async insert(userId, type, message, eventKey) {
      try {
        await execute('INSERT INTO notifications (user_id, type, message, event_key, is_read, created_at) VALUES (?, ?, ?, ?, FALSE, UTC_TIMESTAMP())', [userId, type, message, eventKey]);
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || !/uq_notifications_user_event/.test(error.sqlMessage ?? '')) throw error;
      }
    },
    async list(userId, { page, limit }) {
      const [[count]] = await execute('SELECT COUNT(*) AS total FROM notifications WHERE user_id=?', [userId]);
      const [rows] = await execute('SELECT notification_id, type, message, is_read, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC, notification_id DESC LIMIT ? OFFSET ?', [userId, limit, (page - 1) * limit]);
      return { rows, total: count.total };
    },
    async owner(id) { const [[row]] = await execute('SELECT user_id FROM notifications WHERE notification_id=?', [id]); return row?.user_id; },
    async markRead(userId, id) { await execute('UPDATE notifications SET is_read=TRUE WHERE notification_id=? AND user_id=? AND is_read=FALSE', [id, userId]); },
    async markAll(userId) { await execute('UPDATE notifications SET is_read=TRUE WHERE user_id=? AND is_read=FALSE', [userId]); },
    async unread(userId) { const [[row]] = await execute('SELECT COUNT(*) AS total FROM notifications WHERE user_id=? AND is_read=FALSE', [userId]); return row.total; }
  };
}
