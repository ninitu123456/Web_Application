import { createDbPool, query } from '../config/db.js';
import { createHealthRepository } from '../repositories/health.repository.js';
import { createHealthService } from '../services/health.service.js';
import { logError } from '../utils/logger.js';

let pool;
try {
  pool = createDbPool();
  console.log('Health:', await createHealthService(createHealthRepository(pool)).check());
  const [roles] = await query(pool, 'SELECT name FROM roles ORDER BY role_id');
  const [categories] = await query(pool, 'SELECT name, is_active FROM categories ORDER BY category_id LIMIT 10');
  console.log('Roles:', roles);
  console.log('Categories:', categories);
} catch (error) { logError('database_check_failed', error); process.exitCode = 1; }
finally { if (pool) await pool.end(); }
