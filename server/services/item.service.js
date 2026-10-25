import { HttpError } from '../utils/http-error.js';
import { itemDto } from '../utils/item-dto.js';
import { randomUUID } from 'node:crypto';

const notFound = () => new HttpError(404, 'Không tìm thấy Item');
const forbidden = () => new HttpError(403, 'Không có quyền truy cập');
function supportedImage(file) {
  const bytes = file.buffer;
  const signatures = {
    'image/jpeg': bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/gif': bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()),
    'image/webp': bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  };
  return Boolean(signatures[file.mimetype]);
}
function safeImageId(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Image ID cannot be represented safely in the API');
  return result;
}
export function createItemService(repository, imageStorage, imageOperations) {
  async function assertReferences(item, source = repository) {
    if (item.categoryId !== undefined && !await source.categoryActive(item.categoryId)) throw new HttpError(400, 'Danh mục không tồn tại hoặc không hoạt động');
    if (item.locationId !== undefined && !await source.locationActive(item.locationId)) throw new HttpError(400, 'Địa điểm không tồn tại hoặc không hoạt động');
  }
  async function owned(identity, itemId, source = repository, allowAdmin = false) {
    const item = await source.findById(itemId);
    if (!item) throw notFound();
    if (String(item.user_id) !== String(identity.id) && !(allowAdmin && identity.role === 'ADMIN')) throw forbidden();
    return item;
  }
  function open(item) {
    if (item.status !== 'OPEN') throw new HttpError(400, 'Thao tác chỉ hợp lệ khi Item đang mở');
  }
  async function imageCapacity(source, id, amount) {
    const count = await source.countImages(id);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Item image count is invalid');
    if (count + amount > 5) throw new HttpError(400, 'Mỗi Item được phép có tối đa 5 ảnh');
  }
  return {
    async create(identity, item) { await assertReferences(item); return itemDto(await repository.create(identity.id, item)); },
    async get(id) { const item = await repository.findById(id); if (!item) throw notFound(); return itemDto(item); },
    async list(filters) {
      const result = await repository.list(filters);
      if (!Number.isSafeInteger(result.total) || result.total < 0) throw new Error('Item count cannot be represented safely in the API');
      const totalPages = Math.ceil(result.total / filters.limit);
      return { data: result.items.map(itemDto), pagination: { page: filters.page, limit: filters.limit, total: result.total, totalPages } };
    },
    async update(identity, id, fields) {
      return repository.withLockedItem(id, async (source) => {
        open(await owned(identity, id, source));
        await assertReferences(fields, source);
        await source.update(id, fields);
        return itemDto(await source.findById(id));
      });
    },
    async close(identity, id) {
      return repository.withLockedItem(id, async (source) => {
        const item = await owned(identity, id, source, true);
        open(item);
        if (!await source.close(id)) throw new HttpError(400, 'Trạng thái Item không thể đóng');
        await source.recordClose(identity, item.status);
        return itemDto(await source.findById(id));
      });
    },
    async uploadImages(identity, id, files) {
      open(await owned(identity, id));
      if (!files?.length) throw new HttpError(400, 'Vui lòng chọn ảnh');
      await imageCapacity(repository, id, files.length);
      if (!imageStorage) throw new HttpError(503, 'Dịch vụ lưu trữ ảnh chưa được cấu hình');
      for (const file of files) if (!supportedImage(file)) throw new HttpError(400, 'Nội dung ảnh không hợp lệ');
      const publicIds = files.map(() => `findit/items/${randomUUID()}`);
      return imageOperations.run({ userId: identity.id, itemId: id, kind: 'UPLOAD', publicIds }, async (operationId) => {
        const uploaded = [];
        for (const [index, file] of files.entries()) {
          const asset = await imageStorage.upload(file.buffer, file.mimetype, publicIds[index]);
          if (asset.publicId !== publicIds[index]) throw new Error('Unexpected image public ID');
          uploaded.push(asset);
        }
        return repository.withLockedItem(id, async (source) => {
          open(await owned(identity, id, source));
          await imageCapacity(source, id, uploaded.length);
          const saved = [];
          for (const asset of uploaded) {
            const image = await source.addImage(id, asset.url, asset.publicId);
            saved.push({ id: safeImageId(image.image_id), url: image.image_url });
          }
          await source.completeImageOperation(operationId);
          return saved;
        });
      });
    },
    async deleteImage(identity, id, imageId) {
      const item = await owned(identity, id);
      open(item);
      const image = await repository.findImage(imageId);
      if (!image || String(image.item_id) !== String(item.item_id)) throw notFound();
      if (image.cloudinary_public_id && !imageStorage) throw new HttpError(503, 'Dịch vụ lưu trữ ảnh chưa được cấu hình');
      return imageOperations.run({ userId: identity.id, itemId: id, kind: 'DELETE', publicIds: image.cloudinary_public_id ? [image.cloudinary_public_id] : [] }, (operationId) =>
        repository.withLockedItem(id, async (source) => {
          open(await owned(identity, id, source));
          const current = await source.findImage(imageId);
          if (!current || String(current.item_id) !== String(id)) throw notFound();
          await source.deleteImage(imageId);
          await source.completeImageOperation(operationId);
        }));
    }
  };
}
