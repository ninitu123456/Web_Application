import { configFromEnv } from '../../database/scripts/config.js';
import { createDbPool } from '../config/db.js';
import { logError } from '../utils/logger.js';
import { createCloudinaryImageSource } from './cloudinary-image-source.js';
import { createClipEncoder } from './clip-encoder.js';
import { readAiVisualConfig } from './config.js';
import { createAiVisualRepository } from './repository.js';
import { createAiVisualWorker } from './worker.js';
import { createAiVisualSnapshotService } from './snapshot-service.js';
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
import { assertAiVisualSchema } from './schema-check.js';

const config = readAiVisualConfig(process.env, 'worker');
if (!config.enabled) throw new Error('AI Visual Matching is disabled; set AI_VISUAL_MATCHING_ENABLED=true to start this worker');

const pool = createDbPool(configFromEnv());
const abort = new AbortController();
let encoder, shutdownTimer;
const stop = () => {
  abort.abort();
  shutdownTimer ??= setTimeout(() => process.exit(1), 90000);
  shutdownTimer.unref();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  if (!config.production) await assertIsolatedInstance();
  await assertAiVisualSchema(pool);
  const imageSource = createCloudinaryImageSource();
  encoder = await createClipEncoder();
  console.log(JSON.stringify({ event: 'ai_visual_worker_ready', modelId: 'Xenova/clip-vit-base-patch32', revision: '4c1807b705b1d015fb032789cc4d221b23025a6f', device: 'cpu', concurrency: 1, initializationMs: encoder.initializationMs, rssBytes: process.memoryUsage().rss }));
  const snapshotService = createAiVisualSnapshotService(pool, {
    processingEnabled: config.notificationProcessingEnabled,
    shadowMode: config.notificationShadowMode,
    demoNotificationsEnabled: config.demoNotificationsEnabled,
    demoMinCosine: config.demoMinCosine
  });
  const worker = createAiVisualWorker({ repository: createAiVisualRepository(pool), encoder, imageSource, config, snapshotService, onEvent: (event) => console.log(JSON.stringify(event)) });
  await worker.run(abort.signal);
} catch (error) {
  logError('ai_visual_worker_stopped', error);
  process.exitCode = 1;
} finally {
  try { await encoder?.dispose?.(); }
  catch (error) { logError('ai_visual_encoder_cleanup_failed', error); process.exitCode = 1; }
  finally { await pool.end(); clearTimeout(shutdownTimer); }
}
