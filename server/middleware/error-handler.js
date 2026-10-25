import { HttpError } from '../utils/http-error.js';
import { logError } from '../utils/logger.js';

export function createErrorHandler(logger = logError) {
  return (error, request, response, next) => {
    if (response.headersSent) return next(error);
    let status = 500, message = 'Lỗi máy chủ nội bộ';
    if (error instanceof HttpError) { status = error.status; message = error.message; }
    else if (error.type === 'entity.parse.failed') { status = 400; message = 'Dữ liệu JSON không hợp lệ'; }
    else if (error.type === 'entity.too.large') { status = 413; message = 'Dữ liệu yêu cầu quá lớn'; }
    if (error.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'Tệp tải lên quá lớn'; }
    else if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') { status = 400; message = 'Số lượng tệp không hợp lệ'; }
    if (status >= 500) logger('http_request_failed', error);
    response.status(status).json({ success: false, message });
  };
}
