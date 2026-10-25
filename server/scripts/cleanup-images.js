import { createDbPool } from '../config/db.js';
import { createImageStorage } from '../config/cloudinary.js';
import { createImageOperations } from '../services/image-operations.js';
import { logError } from '../utils/logger.js';

let pool;
try {
  const storage = createImageStorage();
  if (!storage) throw new Error('Image storage must be configured for cleanup');
  pool = createDbPool();
  const result = await createImageOperations(pool, storage).recoverPending();
  console.log('Image cleanup:', result);
  if (result.failed) process.exitCode = 1;
} catch (error) { logError('image_cleanup_failed', error); process.exitCode = 1; }
finally { if (pool) await pool.end(); }
