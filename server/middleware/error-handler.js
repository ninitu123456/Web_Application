import { HttpError } from '../utils/http-error.js';
import { logError } from '../utils/logger.js';

export function createErrorHandler(logger = logError) {
  return (error, request, response, next) => {
    if (response.headersSent) return next(error);
    let status = 500, message = 'Lỗi máy chủ nội bộ';
    if (error instanceof HttpError) { status = error.status; message = error.message; }
    else if (error.type === 'entity.parse.failed') { status = 400; message = 'Dữ liệu JSON không hợp lệ'; }
    else if (error.type === 'entity.too.large') { status = 413; message = 'Dữ liệu yêu cầu quá lớn'; }
    if (['LIMIT_FILE_SIZE', 'LIMIT_FIELD_VALUE'].includes(error.code)) { status = 413; message = 'Tệp tải lên quá lớn'; }
    else if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE', 'LIMIT_PART_COUNT', 'LIMIT_FIELD_COUNT', 'LIMIT_FIELD_KEY'].includes(error.code)) { status = 400; message = 'Dữ liệu tải lên không hợp lệ'; }
    if (status >= 500) logger('http_request_failed', error);
    response.status(status).json({ success: false, message });
  };
}
