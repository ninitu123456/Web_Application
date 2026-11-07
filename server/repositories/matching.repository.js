import { databaseTimeout, query } from '../config/db.js';
import { createNotificationRepository } from './notification.repository.js';
import { createNotificationService } from '../services/notification.service.js';

import { readSnapshot } from '../config/read-snapshot.js';
import { hiddenItemSql } from '../utils/item-visibility.js';

const fields = 'item_id AS id, type, status, category_id AS categoryId, location_id AS locationId, event_date AS eventDate, title, description';
export function createMatchingRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  return {
    async item(id, lock = false) {
      const [[item]] = await execute(`SELECT ${fields}, ${hiddenItemSql('items.item_id')} AS is_hidden FROM items WHERE item_id = ?${lock ? ' FOR UPDATE' : ''}`, [id]);
      return item;
    },
    async candidates(item, after = '0') {
      const [rows] = await execute(`SELECT ${fields} FROM items WHERE type = ? AND status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND item_id <> ? AND item_id > ? AND ${hiddenItemSql('items.item_id')} = 0 ORDER BY item_id LIMIT 100 FOR UPDATE`, [item.type === 'LOST' ? 'FOUND' : 'LOST', item.id, after]);
      return rows;
    },
    async save(lostId, foundId, result) {
      const values = [result.score, JSON.stringify(result.reasons), lostId, foundId];
      if (result.score < 50) {
        await execute('UPDATE matches SET match_score = ?, reasons = ? WHERE lost_item_id = ? AND found_item_id = ?', values);
      } else {
        const [[existing]] = await execute('SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=? FOR UPDATE', [lostId, foundId]);
        await execute(`INSERT INTO matches (match_score, reasons, lost_item_id, found_item_id, status, created_at) VALUES (?, ?, ?, ?, 'POTENTIAL', UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE match_score = VALUES(match_score), reasons = VALUES(reasons)`, values);
        const [[match]] = await execute('SELECT match_id FROM matches WHERE lost_item_id=? AND found_item_id=?', [lostId, foundId]);
        const [owners] = await execute('SELECT i.item_id, i.user_id, i.title FROM items i WHERE i.item_id IN (?,?) ORDER BY i.item_id', [lostId, foundId]);
        const recipients = new Set();
        for (const owner of owners) {
          if (recipients.has(String(owner.user_id))) continue;
          recipients.add(String(owner.user_id));
          const related = owners.find(other => String(other.item_id) !== String(owner.item_id));
          const payload = { ownTitle: owner.title, title: related.title, itemId: String(related.item_id), score: result.score };
          await execute(`INSERT INTO email_outbox (user_id,event_key,payload,status,next_attempt_at,created_at)
            VALUES (?,?,?,'PENDING',UTC_TIMESTAMP(),UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE job_id=job_id`,
            [owner.user_id, `MATCH:${match.match_id}`, JSON.stringify(payload)]);
        }
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
        const [[item]] = await run(`SELECT i.item_id FROM items i WHERE i.item_id=? AND ${hiddenItemSql()} = 0`, [id]);
        if (!item) return undefined;
        const [[count]] = await run(`SELECT COUNT(*) AS total FROM matches m JOIN items l ON l.item_id = m.lost_item_id JOIN items f ON f.item_id = m.found_item_id
        WHERE (m.lost_item_id = ? OR m.found_item_id = ?) AND l.type = 'LOST' AND f.type = 'FOUND'
        AND l.item_id <> f.item_id AND l.status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND f.status IN ('OPEN','CLAIM_PENDING','CLAIMED')
        AND m.match_score >= 50 AND ${hiddenItemSql('l.item_id')} = 0 AND ${hiddenItemSql('f.item_id')} = 0`, [id, id]);
        const [rows] = await run(`SELECT m.match_id AS matchId, CASE WHEN m.lost_item_id = ? THEN m.found_item_id ELSE m.lost_item_id END AS itemId, m.match_score AS score, m.reasons
        FROM matches m JOIN items l ON l.item_id = m.lost_item_id JOIN items f ON f.item_id = m.found_item_id
        WHERE (m.lost_item_id = ? OR m.found_item_id = ?) AND l.type = 'LOST' AND f.type = 'FOUND'
        AND l.item_id <> f.item_id AND l.status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND f.status IN ('OPEN','CLAIM_PENDING','CLAIMED')
        AND m.match_score >= 50 AND ${hiddenItemSql('l.item_id')} = 0 AND ${hiddenItemSql('f.item_id')} = 0 ORDER BY m.match_score DESC, m.match_id ASC LIMIT ? OFFSET ?`, [id, id, id, options.limit, (options.page - 1) * options.limit]);
        return { rows, total: count.total };
      });
    }
  };
}
