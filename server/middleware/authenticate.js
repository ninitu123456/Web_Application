import { unauthorized } from '../utils/jwt.js';

export function authenticate(authService) {
  return async (request, response, next) => {
    const authorization = request.get('Authorization');
    const match = typeof authorization === 'string' && /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match) throw unauthorized();
    request.user = await authService.authenticate(match[1]);
    next();
  };
}
