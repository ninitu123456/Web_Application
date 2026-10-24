import { HttpError } from '../utils/http-error.js';

export function notFound(request, response, next) {
  next(new HttpError(404, 'Không tìm thấy API'));
}
