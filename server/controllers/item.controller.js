import { validateCreateItem, validateUpdateItem, validateSearch, positiveId } from '../validation/item.validation.js';

export function createItemController(service) {
  return {
    async create(request, response) { const data = await service.create(request.user, validateCreateItem(request.body)); response.status(201).json({ success: true, message: 'Tạo Item thành công', data }); },
    async list(request, response) { const result = await service.list(validateSearch(request.query)); response.json({ success: true, data: result.data, pagination: result.pagination }); },
    async get(request, response) { response.json({ success: true, data: await service.get(positiveId(request.params.id)) }); },
    async update(request, response) { response.json({ success: true, message: 'Cập nhật Item thành công', data: await service.update(request.user, positiveId(request.params.id), validateUpdateItem(request.body)) }); },
    async close(request, response) { response.json({ success: true, message: 'Đóng Item thành công', data: await service.close(request.user, positiveId(request.params.id)) }); },
    async uploadImages(request, response) { const data = await service.uploadImages(request.user, positiveId(request.params.id), request.files); response.status(201).json({ success: true, data }); },
    async deleteImage(request, response) { await service.deleteImage(request.user, positiveId(request.params.id), positiveId(request.params.imageId)); response.json({ success: true, message: 'Xóa ảnh thành công' }); }
  };
}
