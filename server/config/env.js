// This existing module loads the root .env once and validates DB settings.
import { configFromEnv } from '../../database/scripts/config.js';

export const defaultCorsOrigins = ['http://localhost:5173', 'http://localhost:3000'];
export function readAppConfig(env = process.env) {
  const port = Number(env.PORT ?? 3001);
  const host = env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  if (!host || /[\s/\\]/.test(host)) throw new Error('HOST must be a hostname or IP address');
  const origins = env.CORS_ORIGINS === undefined ? defaultCorsOrigins : env.CORS_ORIGINS.split(',').map((origin) => origin.trim());
  for (const origin of origins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error('CORS_ORIGINS must contain HTTP(S) origins without paths or credentials');
    }
  }
  return { host, port, corsOrigins: [...new Set(origins)] };
}
export function readConfig(env = process.env) {
  try { return { ...readAppConfig(env), database: configFromEnv(env), auth: readAuthConfig(env) }; }
  catch (error) { error.code = 'INVALID_CONFIG'; throw error; }
}

export function readAuthConfig(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || !secret.trim() || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be configured locally with at least 32 bytes');
  }
  const expiresIn = Number(env.JWT_EXPIRES_IN ?? 3600);
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) throw new Error('JWT_EXPIRES_IN must be a positive integer number of seconds');
  return { secret, expiresIn };
}
