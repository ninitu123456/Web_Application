import { isAbsolute } from 'node:path';

// Production is an explicit alternative to, never an exception in, the local
// disposable-instance guard. Errors contain variable names only.
export function validateProductionAi(env, role = 'api') {
  if (env.AI_VISUAL_MODE !== 'production') return false;
  if (env.NODE_ENV !== 'production') throw new Error('AI_VISUAL_MODE=production requires NODE_ENV=production');
  if (env.AI_VISUAL_SERVICE_ROLE !== role) throw new Error(`AI_VISUAL_SERVICE_ROLE must be ${role} for this command`);
  if (env.FINDIT_ISOLATED_DATADIR) throw new Error('FINDIT_ISOLATED_DATADIR must be absent in production AI mode');
  if (!env.DB_HOST || !/^[a-zA-Z0-9.-]+$/.test(env.DB_HOST) || !env.DB_PORT ||
      !Number.isInteger(Number(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535 ||
      env.DB_NAME !== 'findit_db' || !env.DB_USER || !env.DB_PASSWORD) {
    throw new Error('Production AI requires explicit DB_HOST, DB_PORT, DB_NAME=findit_db, DB_USER and DB_PASSWORD');
  }
  for (const name of ['AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED', 'AI_VISUAL_NOTIFICATION_SHADOW_MODE', 'AI_VISUAL_NOTIFICATION_DEMO_ENABLED']) {
    if (env[name] !== undefined && env[name] !== 'false') throw new Error(`${name} must be false in production`);
  }
  if (role === 'worker' && (!env.AI_VISUAL_MATCHING_CACHE_DIR || !isAbsolute(env.AI_VISUAL_MATCHING_CACHE_DIR) || !env.AI_VISUAL_MATCHING_CLOUD_NAME)) {
    throw new Error('Production worker requires AI_VISUAL_MATCHING_CACHE_DIR and AI_VISUAL_MATCHING_CLOUD_NAME');
  }
  if (role === 'worker' && env.AI_VISUAL_SUGGESTIONS_ENABLED !== undefined && env.AI_VISUAL_SUGGESTIONS_ENABLED !== 'false') {
    throw new Error('AI_VISUAL_SUGGESTIONS_ENABLED belongs on the API; leave it false or absent on the worker');
  }
  if (role === 'worker' && env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_CLOUD_NAME !== env.AI_VISUAL_MATCHING_CLOUD_NAME) {
    throw new Error('AI_VISUAL_MATCHING_CLOUD_NAME must match CLOUDINARY_CLOUD_NAME when both are set');
  }
  return true;
}

export function validateAiMode(env) {
  if (env.AI_VISUAL_MODE !== undefined && !['isolated', 'production'].includes(env.AI_VISUAL_MODE)) {
    throw new Error('AI_VISUAL_MODE must be isolated or production');
  }
}
