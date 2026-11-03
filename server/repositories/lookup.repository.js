import { query } from '../config/db.js';

export function createLookupRepository(pool) {
  return {
    async categories() { const [rows] = await query(pool, 'SELECT category_id AS id, name FROM categories WHERE is_active = TRUE ORDER BY name, category_id'); return rows; },
    async locations() { const [rows] = await query(pool, 'SELECT location_id AS id, name FROM locations WHERE is_active = TRUE ORDER BY name, location_id'); return rows; }
  };
}
