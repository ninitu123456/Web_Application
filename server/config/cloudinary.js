import { v2 as cloudinary } from 'cloudinary';

export function createImageStorage(env = process.env, client = cloudinary) {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = env;
  if (!cloudName && !apiKey && !apiSecret) return undefined;
  if (!cloudName || !apiKey || !apiSecret) throw new Error('Cloudinary credentials must be configured together');
  client.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return {
    upload(buffer, mimetype) {
      return new Promise((resolve, reject) => {
        const stream = client.uploader.upload_stream({ folder: 'findit/items', resource_type: 'image', format: mimetype === 'image/png' ? 'png' : undefined }, (error, result) => {
          if (error) reject(error); else resolve({ url: result.secure_url, publicId: result.public_id });
        });
        stream.end(buffer);
      });
    },
    destroy(publicId) { return client.uploader.destroy(publicId, { resource_type: 'image' }); }
  };
}
