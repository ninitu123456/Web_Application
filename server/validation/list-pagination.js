import { pagination } from './workflow.validation.js';
import { HttpError } from '../utils/http-error.js';

export function listPagination(query = {}) {
  const options = pagination(query);
  if ((options.page - 1) * options.limit > 100000) throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
  return options;
}
