import { HttpError } from '../utils/http-error.js';
import { itemDto } from '../utils/item-dto.js';

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
export function createItemService(repository, imageStorage) {
  async function assertReferences(item) {
    if (item.categoryId !== undefined && !await repository.categoryActive(item.categoryId)) throw new HttpError(400, 'Danh mục không tồn tại hoặc không hoạt động');
    if (item.locationId !== undefined && !await repository.locationActive(item.locationId)) throw new HttpError(400, 'Địa điểm không tồn tại hoặc không hoạt động');
  }
  async function owned(identity, itemId) {
    const item = await repository.findById(itemId);
    if (!item) throw notFound();
    if (String(item.user_id) !== String(identity.id) && identity.role !== 'ADMIN') throw forbidden();
    return item;
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
      const item = await owned(identity, id);
      if (item.status !== 'OPEN') throw new HttpError(409, 'Chỉ có thể chỉnh sửa Item đang mở');
      await assertReferences(fields);
      await repository.update(id, fields);
      const updated = await repository.findById(id);
      if (!updated) throw notFound();
      if (updated.status !== 'OPEN') throw new HttpError(409, 'Chỉ có thể chỉnh sửa Item đang mở');
      return itemDto(updated);
    },
    async close(identity, id) {
      const item = await owned(identity, id);
      if (item.status !== 'OPEN') throw new HttpError(409, 'Trạng thái Item không thể đóng');
      if (!await repository.close(id)) {
        const latest = await repository.findById(id);
        if (!latest) throw notFound();
        throw new HttpError(409, 'Trạng thái Item không thể đóng');
      }
      return itemDto(await repository.findById(id));
    },
    async uploadImages(identity, id, files) {
      const item = await owned(identity, id);
      if (item.status !== 'OPEN') throw new HttpError(409, 'Chỉ có thể thêm ảnh cho Item đang mở');
      if (!files?.length) throw new HttpError(400, 'Vui lòng chọn ảnh');
      const existingImageCount = await repository.countImages(id);
      if (!Number.isSafeInteger(existingImageCount) || existingImageCount < 0) throw new Error('Item image count is invalid');
      if (existingImageCount + files.length > 5) throw new HttpError(400, 'Mỗi Item được phép có tối đa 5 ảnh');
      if (!imageStorage) throw new HttpError(503, 'Dịch vụ lưu trữ ảnh chưa được cấu hình');
      const saved = [];
      try {
        for (const file of files) {
          if (!supportedImage(file)) throw new HttpError(400, 'Nội dung ảnh không hợp lệ');
          const uploaded = await imageStorage.upload(file.buffer, file.mimetype);
          try { saved.push(await repository.addImage(id, uploaded.url, uploaded.publicId)); }
          catch (error) { await imageStorage.destroy(uploaded.publicId).catch(() => {}); throw error; }
        }
      } catch (error) {
        for (const image of saved) {
          let stored;
          try { stored = await repository.findImage(image.image_id); } catch {}
          if (stored) try { await repository.deleteImage(image.image_id); } catch {}
          if (stored?.cloudinary_public_id) await imageStorage.destroy(stored.cloudinary_public_id).catch(() => {});
        }
        throw error;
      }
      return saved.map((image) => ({ id: safeImageId(image.image_id), url: image.image_url }));
    },
    async deleteImage(identity, id, imageId) {
      const item = await owned(identity, id);
      if (item.status !== 'OPEN') throw new HttpError(409, 'Chỉ có thể xóa ảnh của Item đang mở');
      const image = await repository.findImage(imageId);
      if (!image || String(image.item_id) !== String(item.item_id)) throw notFound();
      await repository.deleteImage(imageId);
      if (image.cloudinary_public_id && imageStorage) await imageStorage.destroy(image.cloudinary_public_id).catch(() => {});
    }
  };
}
