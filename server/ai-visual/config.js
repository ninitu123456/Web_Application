import { relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { validateAiMode, validateProductionAi } from './production-config.js';

export const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const CLIP_MODEL_REVISION = '4c1807b705b1d015fb032789cc4d221b23025a6f';
export const CLIP_MODEL_DTYPE = 'q8';
export const CLIP_EMBEDDING_DIMENSIONS = 512;

export function readAiVisualConfig(env = process.env, role = 'api') {
  validateAiMode(env);
  const production = validateProductionAi(env, role);
  const rawEnabled = env.AI_VISUAL_MATCHING_ENABLED ?? 'false';
  if (!['true', 'false'].includes(rawEnabled)) throw new Error('AI_VISUAL_MATCHING_ENABLED must be true or false');
  const enabled = rawEnabled === 'true';
  if (env.AI_VISUAL_MATCHING_CONCURRENCY !== undefined && env.AI_VISUAL_MATCHING_CONCURRENCY !== '1') {
    throw new Error('AI_VISUAL_MATCHING_CONCURRENCY must be 1; only serial CPU inference is supported');
  }
  if (enabled && !production && !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('AI Visual Matching may only be enabled in development or test environments');
  }
  const isolatedDataDir = env.FINDIT_ISOLATED_DATADIR ? resolve(env.FINDIT_ISOLATED_DATADIR) : '';
  const relativeDataDir = isolatedDataDir ? relative(resolve(tmpdir()), isolatedDataDir).split(sep) : [];
  if (enabled && !production && (relativeDataDir.length !== 2 || !/^findit-mysql-[a-zA-Z0-9_-]+$/.test(relativeDataDir[0]) || relativeDataDir[1] !== 'data' ||
      env.DB_HOST !== '127.0.0.1' || !env.DB_PORT || !Number.isInteger(Number(env.DB_PORT)) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535 || [3306, 3311].includes(Number(env.DB_PORT)))) {
    throw new Error('AI Visual Matching requires an explicitly isolated local MySQL datadir and non-service port');
  }
  const cloudName = env.AI_VISUAL_MATCHING_CLOUD_NAME;
  if (enabled && (!cloudName || !/^[a-zA-Z0-9_-]{1,120}$/.test(cloudName) || (role === 'api' || !production) && cloudName !== env.CLOUDINARY_CLOUD_NAME)) {
    throw new Error('AI Visual Matching requires an explicit development Cloudinary or production Cloudinary cloud name matching the upload configuration on the API');
  }
  const readFlag = (name) => {
    const value = env[name] ?? 'false';
    if (!['true', 'false'].includes(value)) throw new Error(`${name} must be true or false`);
    return value === 'true';
  };
  const notificationProcessingEnabled = readFlag('AI_VISUAL_NOTIFICATION_PROCESSING_ENABLED');
  const notificationShadowMode = readFlag('AI_VISUAL_NOTIFICATION_SHADOW_MODE');
  const demoNotificationsEnabled = readFlag('AI_VISUAL_NOTIFICATION_DEMO_ENABLED');
  const demoMinCosine = Number(env.AI_VISUAL_NOTIFICATION_DEMO_MIN_COSINE ?? '0.95');
  if (!Number.isFinite(demoMinCosine) || demoMinCosine < -1 || demoMinCosine > 1) throw new Error('AI_VISUAL_NOTIFICATION_DEMO_MIN_COSINE must be between -1 and 1');
  if (notificationShadowMode && demoNotificationsEnabled) throw new Error('AI visual shadow mode and demo notifications are mutually exclusive');
  if ((notificationProcessingEnabled || notificationShadowMode || demoNotificationsEnabled) && !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('AI visual notification processing is restricted to development/test');
  }
  if (notificationProcessingEnabled && !enabled) throw new Error('AI visual notification processing requires AI_VISUAL_MATCHING_ENABLED=true');
  if (demoNotificationsEnabled && (!notificationProcessingEnabled || !env.FINDIT_ISOLATED_DATADIR || env.DB_HOST !== '127.0.0.1' || !env.DB_PORT || [3306, 3311].includes(Number(env.DB_PORT)) || !/^findit_test_[a-f0-9]{24}$/.test(env.DB_NAME ?? ''))) {
    throw new Error('AI visual demo notifications require the verified isolated disposable test database');
  }
  const pollMs = Number(env.AI_VISUAL_MATCHING_POLL_MS ?? 1000);
  if (!Number.isSafeInteger(pollMs) || pollMs < 250 || pollMs > 60000) throw new Error('AI_VISUAL_MATCHING_POLL_MS must be an integer from 250 to 60000');
  const maxAttempts = Number(env.AI_VISUAL_MATCHING_MAX_ATTEMPTS ?? 3);
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error('AI_VISUAL_MATCHING_MAX_ATTEMPTS must be an integer from 1 to 10');
  return { enabled, production, pollMs, maxAttempts, leaseRenewMs: 30000, notificationProcessingEnabled, notificationShadowMode, demoNotificationsEnabled, demoMinCosine };
}
