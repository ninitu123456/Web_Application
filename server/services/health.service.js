import { HttpError } from '../utils/http-error.js';
import { performance } from 'node:perf_hooks';

export function createHealthService(repository, { now = () => performance.now() } = {}) {
  let cache, inflight;
  return {
    async check({ fresh = false } = {}) {
      if (inflight) return inflight;
      if (!fresh && cache && now() < cache.until) {
        if (cache.error) throw cache.error;
        return { status: 'ok', database: 'up' };
      }
      inflight = (async () => {
        try {
          const result = await repository.checkConnection();
          if (Number(result?.ok) !== 1 || result.database_name !== 'findit_db') {
            throw Object.assign(new Error('Unexpected database probe result'), { code: 'DB_PROBE_FAILED' });
          }
          cache = { until: now() + 2000 };
          return { status: 'ok', database: 'up' };
        } catch (cause) {
          const error = new HttpError(503, 'Cơ sở dữ liệu tạm thời không khả dụng', { cause });
          cache = { until: now() + 1000, error };
          throw error;
        }
      })();
      try { return await inflight; } finally { inflight = undefined; }
    }
  };
}
