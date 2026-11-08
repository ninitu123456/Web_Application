// This existing module loads the root .env once and validates DB settings.
import { configFromEnv } from '../../database/scripts/config.js';
import { readAiVisualConfig } from '../ai-visual/config.js';
import { relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { validateAiMode, validateProductionAi } from '../ai-visual/production-config.js';

export const defaultCorsOrigins = ['http://localhost:5173', 'http://localhost:3000'];
export function readSecurityConfig(env = process.env) {
  const result = { production: env.NODE_ENV === 'production' };
  for (const [name, fallback] of Object.entries({ api: 300, login: 30, register: 10, upload: 10, health: 60 })) {
    const value = Number(env[`RATE_LIMIT_${name.toUpperCase()}_MAX`] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid RATE_LIMIT_${name.toUpperCase()}_MAX`);
    result[`${name}Max`] = value;
  }
  return result;
}
export function readHealthConfig(env = process.env) {
  const timeoutMs = Number(env.HEALTH_PROBE_TIMEOUT_MS ?? 1000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new Error('Invalid HEALTH_PROBE_TIMEOUT_MS');
  return { timeoutMs };
}
export function readAiVisualSuggestionsConfig(env = process.env) {
  validateAiMode(env);
  const raw = env.AI_VISUAL_SUGGESTIONS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(raw)) throw new Error('AI_VISUAL_SUGGESTIONS_ENABLED must be true or false');
  const enabled = raw === 'true';
  if (enabled && !validateProductionAi(env, 'api')) {
    const isolated = env.FINDIT_ISOLATED_DATADIR ? resolve(env.FINDIT_ISOLATED_DATADIR) : '';
    const parts = isolated ? relative(resolve(tmpdir()), isolated).split(sep) : [];
    const port = Number(env.DB_PORT);
    if (!['development', 'test'].includes(env.NODE_ENV) || env.DB_HOST !== '127.0.0.1' ||
        !env.DB_PORT || !Number.isInteger(port) || port < 1 || port > 65535 || [3306, 3311].includes(port) ||
        parts.length !== 2 || !/^findit-mysql-[a-zA-Z0-9_-]+$/.test(parts[0]) || parts[1] !== 'data') {
      throw new Error('AI Visual Suggestions require development/test and an explicitly isolated local MySQL datadir and non-service port');
    }
  }
  return { enabled };
}
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
  try { return { ...readAppConfig(env), database: configFromEnv(env), auth: readAuthConfig(env), security: readSecurityConfig(env), health: readHealthConfig(env), aiVisual: readAiVisualConfig(env), aiVisualSuggestions: readAiVisualSuggestionsConfig(env) }; }
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
