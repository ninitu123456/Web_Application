import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createImageStorage } from '../config/cloudinary.js';

const credentials = { CLOUDINARY_CLOUD_NAME: 'test-only', CLOUDINARY_API_KEY: 'test-only', CLOUDINARY_API_SECRET: 'test-only' };

test('Cloudinary adapter requires complete credentials and uses the journaled public ID', async () => {
  assert.equal(createImageStorage({}, {}), undefined);
  assert.throws(() => createImageStorage({ CLOUDINARY_API_KEY: 'test' }, {}), /together/);
  let options, bytes;
  const storage = createImageStorage(credentials, {
    config(value) { assert.equal(value.secure, true); },
    uploader: {
      upload_stream(value, callback) {
        options = value;
        return new Writable({ write(chunk, encoding, next) { bytes = chunk; next(); }, final(next) {
          callback(null, { secure_url: 'https://mock.invalid/image', public_id: value.public_id }); next();
        } });
      }
    }
  });
  assert.deepEqual(await storage.upload(Buffer.from('image'), 'image/png', 'findit/items/test-id'), { url: 'https://mock.invalid/image', publicId: 'findit/items/test-id' });
  assert.equal(options.public_id, 'findit/items/test-id');
  assert.equal(options.overwrite, false); assert.equal(options.folder, undefined);
  assert.ok(options.timeout > 0); assert.equal(bytes.toString(), 'image');
});

test('Cloudinary stream errors reject and unconfirmed deletion is never treated as success', async () => {
  let result = 'ok';
  const storage = createImageStorage(credentials, {
    config() {}, uploader: {
      upload_stream() { return new Writable({ write(chunk, encoding, callback) { callback(new Error('Stream failed')); } }); },
      async destroy() { return { result }; }
    }
  });
  await assert.rejects(() => storage.upload(Buffer.from('image'), 'image/png', 'findit/items/test-id'), /Stream failed/);
  await storage.destroy('findit/items/test-id');
  result = 'not found'; await storage.destroy('findit/items/test-id');
  result = 'error'; await assert.rejects(() => storage.destroy('findit/items/test-id'), /not confirmed/);
});
