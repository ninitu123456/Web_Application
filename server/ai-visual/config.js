import { relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

export const CLIP_MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const CLIP_MODEL_REVISION = '4c1807b705b1d015fb032789cc4d221b23025a6f';
export const CLIP_MODEL_DTYPE = 'q8';
export const CLIP_EMBEDDING_DIMENSIONS = 512;

export function readAiVisualConfig(env = process.env) {
  const rawEnabled = env.AI_VISUAL_MATCHING_ENABLED ?? 'false';
  if (!['true', 'false'].includes(rawEnabled)) throw new Error('AI_VISUAL_MATCHING_ENABLED must be true or false');
  const enabled = rawEnabled === 'true';
  if (enabled && !['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('AI Visual Matching may only be enabled in development or test environments');
  }
  const isolatedDataDir = env.FINDIT_ISOLATED_DATADIR ? resolve(env.FINDIT_ISOLATED_DATADIR) : '';
  const relativeDataDir = isolatedDataDir ? relative(resolve(tmpdir()), isolatedDataDir).split(sep) : [];
  if (enabled && (relativeDataDir.length !== 2 || !relativeDataDir[0].startsWith('findit-mysql-') || relativeDataDir[1] !== 'data' ||
      env.DB_HOST !== '127.0.0.1' || !env.DB_PORT || [3306, 3311].includes(Number(env.DB_PORT)))) {
    throw new Error('AI Visual Matching requires an explicitly isolated local MySQL datadir and non-service port');
  }
  const cloudName = env.AI_VISUAL_MATCHING_CLOUD_NAME;
  if (enabled && (!cloudName || !/^[a-zA-Z0-9_-]{1,120}$/.test(cloudName) || cloudName !== env.CLOUDINARY_CLOUD_NAME)) {
    throw new Error('AI Visual Matching requires an explicit development Cloudinary cloud name matching the upload configuration');
  }
  const pollMs = Number(env.AI_VISUAL_MATCHING_POLL_MS ?? 1000);
  if (!Number.isSafeInteger(pollMs) || pollMs < 250 || pollMs > 60000) throw new Error('AI_VISUAL_MATCHING_POLL_MS must be an integer from 250 to 60000');
  const maxAttempts = Number(env.AI_VISUAL_MATCHING_MAX_ATTEMPTS ?? 3);
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error('AI_VISUAL_MATCHING_MAX_ATTEMPTS must be an integer from 1 to 10');
  return { enabled, pollMs, maxAttempts, leaseRenewMs: 30000 };
}
