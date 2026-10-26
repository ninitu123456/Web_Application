import { query } from '../config/db.js';

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
        await execute(`INSERT INTO matches (match_score, reasons, lost_item_id, found_item_id, status, created_at) VALUES (?, ?, ?, ?, 'POTENTIAL', UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE match_score = VALUES(match_score), reasons = VALUES(reasons)`, values);
      }
    },
    async list(id) {
      const [rows] = await execute(`SELECT m.match_id AS matchId, CASE WHEN m.lost_item_id = ? THEN m.found_item_id ELSE m.lost_item_id END AS itemId, m.match_score AS score, m.reasons
        FROM matches m JOIN items l ON l.item_id = m.lost_item_id JOIN items f ON f.item_id = m.found_item_id
        WHERE (m.lost_item_id = ? OR m.found_item_id = ?) AND l.type = 'LOST' AND f.type = 'FOUND'
        AND l.item_id <> f.item_id AND l.status IN ('OPEN','CLAIM_PENDING','CLAIMED') AND f.status IN ('OPEN','CLAIM_PENDING','CLAIMED')
        AND m.match_score >= 50 ORDER BY m.match_score DESC, m.match_id ASC`, [id, id, id]);
      return rows;
    }
  };
}
