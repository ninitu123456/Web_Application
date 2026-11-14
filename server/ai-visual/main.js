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
import { createJobWatchdog } from './job-watchdog.js';

const config = readAiVisualConfig(process.env, 'worker');
if (!config.enabled) throw new Error('AI Visual Matching is disabled; set AI_VISUAL_MATCHING_ENABLED=true to start this worker');

const pool = createDbPool(configFromEnv());
const abort = new AbortController();
let encoder, shutdownTimer;
const watchdog = createJobWatchdog(config.jobTimeoutMs, (jobId) => {
  console.error(JSON.stringify({ event: 'ai_visual_job_timeout', jobId }));
  process.exit(1);
});
let lastCpu = process.cpuUsage(), lastSample = performance.now();
const healthTimer = setInterval(() => {
  const cpu = process.cpuUsage(lastCpu), now = performance.now();
  console.log(JSON.stringify({ event: 'ai_visual_worker_health', rssBytes: process.memoryUsage().rss,
    cpuCores: (cpu.user + cpu.system) / ((now - lastSample) * 1000), uptimeSeconds: process.uptime() }));
  lastCpu = process.cpuUsage(); lastSample = now;
}, 60000);
healthTimer.unref();
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
  const worker = createAiVisualWorker({ repository: createAiVisualRepository(pool), encoder, imageSource, config, snapshotService, onEvent: (event) => {
    watchdog.observe(event);
    console.log(JSON.stringify(event));
  } });
  await worker.run(abort.signal);
} catch (error) {
  logError('ai_visual_worker_stopped', error);
  process.exitCode = 1;
} finally {
  watchdog.stop(); clearInterval(healthTimer);
  try { await encoder?.dispose?.(); }
  catch (error) { logError('ai_visual_encoder_cleanup_failed', error); process.exitCode = 1; }
  finally { await pool.end(); clearTimeout(shutdownTimer); }
}
