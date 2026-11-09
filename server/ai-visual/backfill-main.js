import { configFromEnv } from '../../database/scripts/config.js';
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
import { createDbPool } from '../config/db.js';
import { readAiVisualConfig } from './config.js';
import { backfillAiVisual } from './backfill.js';
import { logError } from '../utils/logger.js';
import { assertAiVisualSchema } from './schema-check.js';

let pool;
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());
try {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--retry-failed', '--rebuild'].includes(arg) && !/^--item-id=[1-9][0-9]{0,19}$/.test(arg))) throw new Error('AI_VISUAL_INVALID_BACKFILL_ARGUMENT');
  const itemIds = args.filter(arg => arg.startsWith('--item-id=')).map(arg => arg.slice(10));
  let config;
  try { config = readAiVisualConfig(process.env, 'worker'); }
  catch (error) { error.code = 'INVALID_CONFIG'; throw error; }
  if (!config.enabled) throw new Error('AI_VISUAL_BACKFILL_REQUIRES_MATCHING_ENABLED');
  if (!config.production) await assertIsolatedInstance();
  pool = createDbPool(configFromEnv());
  await assertAiVisualSchema(pool);
  console.log(JSON.stringify({ event: 'ai_visual_backfill', scope: itemIds.length ? 'explicit_items' : 'all_eligible', ...await backfillAiVisual(pool, { itemIds: itemIds.length ? itemIds : undefined, retryFailed: args.includes('--retry-failed'), rebuild: args.includes('--rebuild'), signal: abort.signal }) }));
  if (abort.signal.aborted) process.exitCode = 1;
} catch (error) { logError('ai_visual_backfill_failed', error); process.exitCode = 1; }
finally { await pool?.end(); }
