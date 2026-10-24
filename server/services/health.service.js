import { HttpError } from '../utils/http-error.js';

export function createHealthService(repository) {
  return {
    async check() {
      try {
        const result = await repository.checkConnection();
        if (Number(result?.ok) !== 1 || result.database_name !== 'findit_db') {
          throw Object.assign(new Error('Unexpected database probe result'), { code: 'DB_PROBE_FAILED' });
        }
        return { status: 'ok', database: 'up' };
      } catch (cause) {
        throw new HttpError(503, 'Cơ sở dữ liệu tạm thời không khả dụng', { cause });
      }
    }
  };
}
