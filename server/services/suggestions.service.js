import { HttpError } from '../utils/http-error.js';
export function createSuggestionsService(repository) {
  return {
    async forOwner(identity, id, options) {
      if (!identity || !['USER', 'ADMIN'].includes(identity.role))
        throw new HttpError(401, 'Chưa xác thực hoặc token không hợp lệ');
      if (!(await repository.isEligible(id, identity.id))) throw new HttpError(404, 'Không tìm thấy gợi ý');
      const result = await repository.read(id, identity.id, options);
      // Check outside the read snapshot, so a concurrent hide/close/owner change
      // cannot be hidden by the repeatable-read view used for counts/pages.
      if (!(await repository.isEligible(id, identity.id))) throw new HttpError(404, 'Không tìm thấy gợi ý');
      return result;
    },
  };
}
