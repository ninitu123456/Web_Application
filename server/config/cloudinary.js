import { v2 as cloudinary } from 'cloudinary';

export function createImageStorage(env = process.env, client = cloudinary) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName && !apiKey && !apiSecret) return undefined;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary credentials must be configured together');
  client.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return {
    upload(buffer, mimetype, publicId) {
      return new Promise((resolve, reject) => {
        const stream = client.uploader.upload_stream({ public_id: publicId, ...(publicId ? {} : { folder: 'findit/items' }), overwrite: false, timeout: 15000, resource_type: 'image', format: mimetype === 'image/png' ? 'png' : undefined }, (error, result) => {
          if (error) reject(error); else resolve({ url: result.secure_url, publicId: result.public_id });
        });
        stream.on('error', reject);
        stream.end(buffer);
      });
    },
    async destroy(publicId) {
      const result = await client.uploader.destroy(publicId, { resource_type: 'image', timeout: 15000 });
      if (!['ok', 'not found'].includes(result?.result)) throw new Error('Image deletion was not confirmed');
    }
  };
}
