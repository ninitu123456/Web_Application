import { query, withConnection, databaseTimeout } from '../config/db.js';

const columns = 'i.item_id, i.user_id, i.category_id, i.location_id, i.title, i.description, i.type, i.color, i.event_date, i.status, i.created_at, i.updated_at, c.name AS category_name, l.name AS location_name';
const joins = 'FROM items i JOIN categories c ON c.category_id = i.category_id JOIN locations l ON l.location_id = i.location_id';
export function createItemRepository(pool) {
  return {
    async categoryActive(id) { const [[row]] = await query(pool, 'SELECT category_id FROM categories WHERE category_id = ? AND is_active = TRUE', [id]); return Boolean(row); },
    async locationActive(id) { const [[row]] = await query(pool, 'SELECT location_id FROM locations WHERE location_id = ? AND is_active = TRUE', [id]); return Boolean(row); },
    async create(userId, item) {
      return withConnection(pool, async (connection) => {
        await connection.query({ sql: 'INSERT INTO items (user_id, category_id, location_id, title, description, type, color, event_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'OPEN\', UTC_TIMESTAMP(), UTC_TIMESTAMP())', timeout: databaseTimeout }, [userId, item.categoryId, item.locationId, item.title, item.description, item.type, item.color, item.eventDate]);
        const [[created]] = await connection.query({ sql: `SELECT ${columns} ${joins} WHERE i.item_id = LAST_INSERT_ID()`, timeout: databaseTimeout });
        return created;
      });
    },
    async findById(id) {
      const [[item]] = await query(pool, `SELECT ${columns} ${joins} WHERE i.item_id = ?`, [id]);
      if (!item) return undefined;
      const [images] = await query(pool, 'SELECT image_id, image_url FROM item_images WHERE item_id = ? ORDER BY image_id', [id]);
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
      const [[count]] = await query(pool, `SELECT COUNT(*) AS total ${joins}${clause}`, values);
      const order = { newest: 'i.created_at DESC, i.item_id DESC', oldest: 'i.created_at ASC, i.item_id ASC', eventDateAsc: 'i.event_date ASC, i.item_id ASC', eventDateDesc: 'i.event_date DESC, i.item_id DESC' }[filters.sort ?? 'newest'];
      const offset = (filters.page - 1) * filters.limit;
      const [items] = await query(pool, `SELECT ${columns} ${joins}${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, [...values, filters.limit, offset]);
      return { items, total: Number(count.total) };
    },
    async update(id, fields) {
      const columnsByField = { title: 'title', categoryId: 'category_id', locationId: 'location_id', eventDate: 'event_date', description: 'description', color: 'color' };
      const keys = Object.keys(fields);
      const assignments = keys.map((key) => `${columnsByField[key]} = ?`);
      const values = keys.map((key) => fields[key]);
      const [result] = await query(pool, `UPDATE items SET ${assignments.join(', ')}, updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'OPEN'`, [...values, id]);
      return result.affectedRows;
    },
    async close(id) {
      const [result] = await query(pool, "UPDATE items SET status = 'CLOSED', updated_at = UTC_TIMESTAMP() WHERE item_id = ? AND status = 'OPEN'", [id]);
      return result.affectedRows;
    },
    async addImage(id, url, publicId) {
      return withConnection(pool, async (connection) => {
        await connection.query({ sql: 'INSERT INTO item_images (item_id, image_url, cloudinary_public_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', timeout: databaseTimeout }, [id, url, publicId]);
        const [[image]] = await connection.query({ sql: 'SELECT image_id, image_url FROM item_images WHERE image_id = LAST_INSERT_ID()', timeout: databaseTimeout });
        return image;
      });
    },
    async countImages(id) {
      const [[row]] = await query(pool, 'SELECT COUNT(*) AS total FROM item_images WHERE item_id = ?', [id]);
      return Number(row.total);
    },
    async findImage(id) { const [[image]] = await query(pool, 'SELECT image_id, item_id, cloudinary_public_id FROM item_images WHERE image_id = ?', [id]); return image; },
    async deleteImage(id) { const [result] = await query(pool, 'DELETE FROM item_images WHERE image_id = ?', [id]); return result.affectedRows; }
  };
}
