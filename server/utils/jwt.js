import jwt from 'jsonwebtoken';
import { HttpError } from './http-error.js';

export const issuer = 'findit-api';
export const audience = 'findit-client';
export const unauthorized = () => new HttpError(401, 'Chưa xác thực hoặc token không hợp lệ');
export function createTokenService({ secret, expiresIn }) {
  return {
    sign(userId, version) {
      return jwt.sign(version === undefined ? {} : { sv: Number(version) }, secret, { algorithm: 'HS256', subject: String(userId), issuer, audience, expiresIn });
    },
    version(token) {
      this.verify(token);
      const value = jwt.decode(token).sv;
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw unauthorized();
      return value ?? 0;
    },
    verify(token) {
      let payload;
      try { payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience }); }
      catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof jwt.NotBeforeError) throw unauthorized();
        throw error;
      }
      if (typeof payload !== 'object' || typeof payload.sub !== 'string' || !/^[1-9]\d*$/.test(payload.sub) ||
          BigInt(payload.sub) > 18446744073709551615n || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)) throw unauthorized();
      return payload.sub;
    }
  };
}
