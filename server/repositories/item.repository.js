import { query, transaction, databaseTimeout } from '../config/db.js';
import { matchingTransaction } from '../services/matching-transaction.js';
import { createMatchingService } from '../services/matching.service.js';
import { createMatchingRepository } from './matching.repository.js';

const columns = 'i.item_id, i.user_id, i.category_id, i.location_id, i.title, i.description, i.type, i.color, i.event_date, i.status, i.created_at, i.updated_at, c.name AS category_name, l.name AS location_name';
const joins = 'FROM items i JOIN categories c ON c.category_id = i.category_id JOIN locations l ON l.location_id = i.location_id';
export function createItemRepository(pool, execute = (sql, values = []) => query(pool, sql, values)) {
  async function attachImages(items) {
    if (!items.length) return items;
    const [images] = await execute(`SELECT image_id, item_id, image_url FROM item_images WHERE item_id IN (${items.map(() => '?').join(',')}) ORDER BY image_id`, items.map((item) => item.item_id));
    const grouped = new Map();
    for (const image of images) {
      const key = String(image.item_id);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(image);
    }
    return items.map((item) => ({ ...item, images: grouped.get(String(item.item_id)) ?? [] }));
  }
  return {
    // All Item mutations share this row lock, including close and image writes.
    withLockedItem(id, operation, { matching = false } = {}) {
      const transact = matching ? matchingTransaction : transaction;
      return transact(pool, async (connection) => {
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        await run('SELECT item_id FROM items WHERE item_id = ? FOR UPDATE', [id]);
        const scoped = createItemRepository(pool, run);
        scoped.recordClose = async (identity, previousStatus) => {
          if (identity.role === 'ADMIN') await run(
            "INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, created_at) VALUES (?, 'ITEM_MODERATED_CLOSED', 'ITEM', ?, ?, UTC_TIMESTAMP())",
            [identity.id, id, JSON.stringify({ previousStatus, status: 'CLOSED' })]);
        };
        scoped.completeImageOperation = async (operationId) => {
          await run("INSERT INTO activity_logs (action, entity_type, entity_id, details, created_at) VALUES ('IMAGE_OPERATION_COMMITTED', 'ITEM', ?, ?, UTC_TIMESTAMP())", [id, JSON.stringify({ operationId })]);
        };
        const result = await operation(scoped);
        if (matching) await createMatchingService(createMatchingRepository(pool, run)).synchronize(id);
        return result;
      });
    },
    async categoryActive(id) { const [[row]] = await execute('SELECT category_id FROM categories WHERE category_id = ? AND is_active = TRUE', [id]); return Boolean(row); },
    async locationActive(id) { const [[row]] = await execute('SELECT location_id FROM locations WHERE location_id = ? AND is_active = TRUE', [id]); return Boolean(row); },
    async create(userId, item) {
      return matchingTransaction(pool, async (connection) => {
        await connection.query({ sql: 'INSERT INTO items (user_id, category_id, location_id, title, description, type, color, event_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'OPEN\', UTC_TIMESTAMP(), UTC_TIMESTAMP())', timeout: databaseTimeout }, [userId, item.categoryId, item.locationId, item.title, item.description, item.type, item.color, item.eventDate]);
        const [[created]] = await connection.query({ sql: `SELECT ${columns} ${joins} WHERE i.item_id = LAST_INSERT_ID()`, timeout: databaseTimeout });
        const run = (sql, values = []) => connection.query({ sql, timeout: databaseTimeout }, values);
        await createMatchingService(createMatchingRepository(pool, run)).synchronize(created.item_id);
        return { ...created, images: [] };
      });
    },
    async findById(id) {
      const [[item]] = await execute(`SELECT ${columns} ${joins} WHERE i.item_id = ?`, [id]);
      if (!item) return undefined;
      const [images] = await execute('SELECT image_id, image_url FROM item_images WHERE item_id = ? ORDER BY image_id', [id]);
      return { ...item, images };
    },
    async list(filters) {
      const where = [], values = [];
      if (filters.keyword) { where.push('(i.title LIKE ? OR i.description LIKE ? OR i.color LIKE ?)'); const term = `%${filters.keyword}%`; values.push(term, term, term); }
      if (filters.type) { where.push('i.type = ?'); values.push(filters.type); }
      if (filters.category) { where.push('i.category_id = ?'); values.push(filters.category); }
      if (filters.location) { where.push('i.location_id = ?'); values.push(filters.location); }
      if (filters.status) { where.push('i.status = ?'); values.push(filters.status); }
      if (filters.dateFrom) { where.push('i.event_date >= ?'); values.push(filters.dateFrom); }
      if (filters.dateTo) { where.push('i.event_date <= ?'); values.push(filters.dateTo); }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const [[count]] = await execute(`SELECT COUNT(*) AS total ${joins}${clause}`, values);
      const order = { newest: 'i.created_at DESC, i.item_id DESC', oldest: 'i.created_at ASC, i.item_id ASC', eventDateAsc: 'i.event_date ASC, i.item_id ASC', eventDateDesc: 'i.event_date DESC, i.item_id DESC' }[filters.sort ?? 'newest'];
      const offset = (filters.page - 1) * filters.limit;
      const [items] = await execute(`SELECT ${columns} ${joins}${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [...values, filters.limit, offset]);
      return { items: await attachImages(items), total: Number(count.total) };
    },
    async update(id, fields) {
      const columnsByField = { title: 'title', categoryId: 'category_id', locationId: 'location_id', eventDate: 'event_date', description: 'description', color: 'color' };
      const keys = Object.keys(fields);
      const assignments = keys.map((key) => `${columnsByField[key]} = ?`);
      const values = keys.map((key) => fields[key]);
      const [result] = await execute(`UPDATE items SET ${assignments.join(', ')}, updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'OPEN'`, [...values, id]);
      return result.affectedRows;
    },
    async close(id) {
      const [result] = await execute("UPDATE items SET status = 'CLOSED', updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'OPEN'", [id]);
      return result.affectedRows;
    },
    async addImage(id, url, publicId) {
      const [result] = await execute('INSERT INTO item_images (item_id, image_url, cloudinary_public_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [id, url, publicId]);
      return { image_id: String(result.insertId), image_url: url, cloudinary_public_id: publicId };
    },
    async countImages(id) {
      const [[row]] = await execute('SELECT COUNT(*) AS total FROM item_images WHERE item_id = ?', [id]);
      return Number(row.total);
    },
    async findImage(id) { const [[image]] = await execute('SELECT image_id, item_id, cloudinary_public_id FROM item_images WHERE image_id = ?', [id]); return image; },
    async deleteImage(id) { const [result] = await execute('DELETE FROM item_images WHERE image_id = ?', [id]); return result.affectedRows; }
  };
}
