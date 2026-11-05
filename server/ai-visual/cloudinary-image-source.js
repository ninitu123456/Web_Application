import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open, unlink } from 'node:fs/promises';

const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PUBLIC_ID = /^findit\/items\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createCloudinaryImageSource({ cloudName = process.env.AI_VISUAL_MATCHING_CLOUD_NAME, fetchImpl = fetch } = {}) {
  if (!cloudName || !/^[a-zA-Z0-9_-]{1,120}$/.test(cloudName)) throw new Error('AI_VISUAL_CLOUDINARY_NOT_CONFIGURED');
  return {
    async download(publicId) {
      if (typeof publicId !== 'string' || !PUBLIC_ID.test(publicId)) throw new Error('AI_VISUAL_UNTRUSTED_IMAGE_SOURCE');
      const url = `https://res.cloudinary.com/${cloudName}/image/upload/c_limit,w_1024,h_1024,f_jpg/${publicId}`;
      const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('AI_VISUAL_IMAGE_DOWNLOAD_FAILED');
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!ALLOWED_MIME.has(contentType)) throw new Error('AI_VISUAL_UNSUPPORTED_IMAGE_TYPE');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) throw new Error('AI_VISUAL_IMAGE_SIZE_LIMIT');
      const chunks = [];
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > MAX_DOWNLOAD_BYTES) throw new Error('AI_VISUAL_IMAGE_SIZE_LIMIT');
        chunks.push(chunk);
      }
      if (!total) throw new Error('AI_VISUAL_EMPTY_IMAGE');
      const filePath = join(tmpdir(), `findit-ai-visual-${randomUUID()}.jpg`);
      const file = await open(filePath, 'wx', 0o600);
      try {
        await file.writeFile(Buffer.concat(chunks));
        await file.close();
      } catch (error) {
        await file.close().catch(() => {});
        await unlink(filePath).catch(() => {});
        throw error;
      }
      return {
        filePath,
        async cleanup() { await unlink(filePath).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
      };
    }
  };
}
