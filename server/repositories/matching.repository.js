import { databaseTimeout, query } from '../config/db.js';
import { createNotificationRepository } from './notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';

import { readSnapshot } from '../config/read-snapshot.js';

const fields = 'item_id AS id, type, status, category_id AS categoryId, location_id AS locationId, event_date AS eventDate, title, description';
export function createMatchingRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  return {
    async item(id, lock = false) {
      const [[item]] = await execute(`SELECT ${fields} FROM items WHERE item_id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
      return item;
    },
    async candidates(item, after = '0') {
      const [rows] = await execute(`SELECT ${fields} FROM items WHERE type = ? AND status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND item_id <> ? AND item_id > ? ORDER BY item_id LIMIT 100 FOR UPDATE`, [item.type === 'LOST' ? 'FOUND' : 'LOST', item.id, after]);
      return rows;
    },
    async save(lostId, foundId, result) {
      const values = [result.score, JSON.stringify(result.reasons), lostId, foundId];
      if (result.score < 50) {
        await execute('UPDATE matches SET match_score = ?, reasons = ? WHERE lost_item_id = ? AND found_item_id = ?', values);
      } else {
        const [[existing]] = await execute('SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=? FOR UPDATE', [lostId, foundId]);
        await execute(`INSERT INTO matches (match_score, reasons, lost_item_id, found_item_id, status, created_at) VALUES (?, ?, ?, ?, 'POTENTIAL', UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE match_score = VALUES(match_score), reasons = VALUES(reasons)`, values);
        if (!existing) {
          const [[created]] = await execute('SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [lostId, foundId]);
          return { created: true, matchId: created.match_id };
        }
      }
      return { created: false };
    },
    async notifyNewMatch(matchId, lostId, foundId) {
      const [owners] = await execute('SELECT user_id FROM items WHERE item_id IN (?, ?) ORDER BY user_id', [lostId, foundId]);
      await createNotificationService(createNotificationRepository(pool, execute)).emit('NEW_MATCH', matchId, owners.map((owner) => owner.user_id));
    },
    list(id, options) {
      return readSnapshot(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        const [[item]] = await run('SELECT item_id FROM items WHERE item_id=?', [id]);
        if (!item) return undefined;
        const [[count]] = await run(`SELECT COUNT(*) AS total FROM matches m JOIN items l ON l.item_id = m.lost_item_id JOIN items f ON f.item_id = m.found_item_id
        WHERE (m.lost_item_id = ? OR m.found_item_id = ?) AND l.type = 'LOST' AND f.type = 'FOUND'
        AND l.item_id <> f.item_id AND l.status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND f.status IN ('OPEN','CLAIM_PENDING','CLAIMED')
        AND m.match_score >= 50`, [id, id]);
        const [rows] = await run(`SELECT m.match_id AS matchId, CASE WHEN m.lost_item_id = ? THEN m.found_item_id ELSE m.lost_item_id END AS itemId, m.match_score AS score, m.reasons
        FROM matches m JOIN items l ON l.item_id = m.lost_item_id JOIN items f ON f.item_id = m.found_item_id
        WHERE (m.lost_item_id = ? OR m.found_item_id = ?) AND l.type = 'LOST' AND f.type = 'FOUND'
        AND l.item_id <> f.item_id AND l.status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND f.status IN ('OPEN','CLAIM_PENDING','CLAIMED')
        AND m.match_score >= 50 ORDER BY m.match_score DESC, m.match_id ASC LIMIT ? OFFSET ?`, [id, id, id, options.limit, (options.page - 1) * options.limit]);
        return { rows, total: count.total };
      });
    }
  };
}
