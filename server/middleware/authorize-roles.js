import { HttpError } from '../utils/http-error.js';
import { unauthorized } from '../utils/jwt.js';

export function authorizeRoles(...roles) {
  return (request, response, next) => {
    if (!request.user) throw unauthorized();
    if (!roles.includes(request.user.role)) throw new HttpError(403, 'Không có quyền truy cập');
    next();
  };
}
