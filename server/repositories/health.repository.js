import { query } from '../config/db.js';

export function createHealthRepository(pool) {
  return {
    async checkConnection() {
      const [[row]] = await query(pool, 'SELECT 1 AS ok, DATABASE() AS database_name');
      return row;
    }
  };
}
