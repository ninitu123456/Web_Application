import { setTimeout as delay } from 'node:timers/promises';
import { encodeEmbedding, rankOppositeObjects } from './embeddings.js';

const ACTIVE = new Set(['OPEN', 'CLAIM_PENDING', 'CLAIMED']);

export function createAiVisualWorker({ repository, encoder, imageSource, config, snapshotService, onEvent = () => {} }) {
  if (!repository || !encoder?.embedFile || !imageSource?.download || !config?.enabled) throw new Error('AI_VISUAL_WORKER_NOT_CONFIGURED');

  function startLeaseHeartbeat(job) {
    const controller = new AbortController();
    let failure;
    const intervalMs = config.leaseRenewMs ?? 30000;
    const task = (async () => {
      while (!controller.signal.aborted) {
        try { await delay(intervalMs, undefined, { signal: controller.signal }); }
        catch (error) { if (error.name === 'AbortError') return; failure = error; return; }
        if (controller.signal.aborted) return;
        try {
          if (repository.renewLease && !await repository.renewLease(job)) throw new Error('AI_VISUAL_LEASE_LOST');
        } catch (error) { failure = error; return; }
      }
    })();
    return {
      assertHealthy() { if (failure) throw failure; },
      async stop() { controller.abort(); await task; }
    };
  }

  async function processNext() {
    const job = await repository.claimNext(config.maxAttempts);
    if (!job) {
      if (!snapshotService?.flags?.processingEnabled) return false;
      const worked = await snapshotService.processNext();
      const delivered = await snapshotService.deliverNextDemo();
      return Boolean(worked || delivered);
    }
    let image, heartbeat;
    try {
      onEvent({ event: 'job_started', jobId: String(job.job_id) });
      heartbeat = startLeaseHeartbeat(job);
      if (Number(job.is_hidden) || !ACTIVE.has(job.item_status) || !['LOST', 'FOUND'].includes(job.type)) {
        await repository.cancel(job);
        onEvent({ event: 'job_cancelled', jobId: String(job.job_id), reason: 'inactive_item' });
        return true;
      }
      const cached = await repository.existingEmbedding?.(job);
      let inference;
      if (cached) inference = { vector: cached, inferenceMs: 0 };
      else {
        image = await imageSource.download(job.cloudinary_public_id);
        inference = await encoder.embedFile(image.filePath);
      }
      heartbeat.assertHealthy();
      const embeddingData = encodeEmbedding(inference.vector);
      const item = await repository.saveEmbedding(job, embeddingData);
      if (!item) {
        onEvent({ event: 'job_cancelled', jobId: String(job.job_id), reason: 'inactive_item_or_lease_lost' });
        return true;
      }
      let afterImageId = '0';
      const pageSize = 250;
      while (true) {
        heartbeat.assertHealthy();
        const rows = await repository.oppositeEmbeddingPage(item.itemId, item.type, job.model_id, job.model_revision, afterImageId, pageSize);
        if (!rows.length) break;
        const query = { itemId: item.itemId, type: item.type, vector: inference.vector };
        const candidates = rankOppositeObjects(query, rows);
        if (await repository.upsertCandidates(job, item.itemId, item.type, job.model_id, job.model_revision, candidates) === false) {
          onEvent({ event: 'job_cancelled', jobId: String(job.job_id), reason: 'lease_lost' });
          return true;
        }
        afterImageId = String(rows.at(-1).image_id);
        if (rows.length < pageSize) break;
      }
      if (!await repository.finish(job, item.itemId)) {
        onEvent({ event: 'job_cancelled', jobId: String(job.job_id), reason: 'inactive_item_or_lease_lost' });
        return true;
      }
      onEvent({ event: 'job_completed', jobId: String(job.job_id), imageId: String(job.image_id), inferenceMs: inference.inferenceMs, embeddingReused: Boolean(cached), rssBytes: process.memoryUsage().rss });
    } catch (error) {
      const code = await repository.fail(job, error, config.maxAttempts);
      onEvent({ event: 'job_failed', jobId: String(job.job_id), code });
    } finally {
      try { await heartbeat?.stop(); } catch { onEvent({ event: 'lease_heartbeat_stop_failed', jobId: String(job.job_id) }); }
      try { await image?.cleanup?.(); } catch { onEvent({ event: 'temporary_image_cleanup_failed', jobId: String(job.job_id) }); }
      onEvent({ event: 'job_settled', jobId: String(job.job_id) });
    }
    return true;
  }

  async function run(signal) {
    let consecutiveFailures = 0;
    while (!signal?.aborted) {
      let worked;
      try { worked = await processNext(); consecutiveFailures = 0; }
      catch (error) {
        consecutiveFailures++;
        const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'AI_VISUAL_WORKER_POLL_FAILED';
        onEvent({ event: 'worker_poll_failed', code });
        const backoffMs = Math.min(30000, config.pollMs * (2 ** Math.min(consecutiveFailures - 1, 5)));
        try { await delay(backoffMs, undefined, signal ? { signal } : undefined); }
        catch (delayError) { if (delayError.name !== 'AbortError') throw delayError; }
        continue;
      }
      if (!worked) {
        try { await delay(config.pollMs, undefined, signal ? { signal } : undefined); }
        catch (error) { if (error.name !== 'AbortError') throw error; }
      }
    }
  }

  return { processNext, run };
}
