import { HttpError } from '../utils/http-error.js';
import { reportDto, paged } from '../utils/workflow-dto.js';

function adminOnly(identity) { if (identity.role !== 'ADMIN') throw new HttpError(403, 'Không có quyền truy cập'); }
export function createReportService(repository) {
  return {
    async create(identity, input) {
      try {
        return await repository.withTransaction(async (source) => {
          const target = await source.target(input.targetType, input.targetId);
          if (!target) throw new HttpError(404, 'Không tìm thấy đối tượng báo cáo');
          if (input.targetType === 'CLAIM' && identity.role !== 'ADMIN' &&
            ![String(target.claimant_id), String(target.user_id)].includes(String(identity.id))) throw new HttpError(403, 'Không có quyền báo cáo Claim');
          return reportDto(await source.create(identity.id, input));
        });
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY' && /uq_reports_active_target/.test(error.sqlMessage ?? '')) throw new HttpError(409, 'Bạn đã có báo cáo đang được xử lý cho đối tượng này');
        if (error.code === 'ER_NO_REFERENCED_ROW_2') throw new HttpError(404, 'Không tìm thấy đối tượng báo cáo');
        throw error;
      }
    },
    async mine(identity, options) { const { rows, total } = await repository.list(identity.id, options); return paged(rows, total, options, reportDto); },
    async list(identity, options) { adminOnly(identity); const { rows, total } = await repository.list(null, options); return paged(rows, total, options, reportDto); },
    async update(identity, id, { status }) {
      adminOnly(identity);
      return repository.withTransaction(async (source) => {
        const row = await source.findForUpdate(id);
        if (!row) throw new HttpError(404, 'Không tìm thấy báo cáo');
        const valid = row.status === 'PENDING' ? status === 'REVIEWING' : row.status === 'REVIEWING' && ['RESOLVED', 'DISMISSED'].includes(status);
        if (!valid || !await source.update(id, row.status, status, identity.id)) throw new HttpError(409, 'Trạng thái báo cáo không cho phép thao tác');
        await source.audit(identity.id, id, row.status, status);
        return reportDto(await source.findForUpdate(id));
      });
    }
  };
}
