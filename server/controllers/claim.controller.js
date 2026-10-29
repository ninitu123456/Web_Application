import { positiveId, validateCreateClaim } from '../validation/claim.validation.js';

export function createClaimController(service) {
  return {
    async create(request, response) {
      const data = await service.create(request.user, positiveId(request.params.id), validateCreateClaim(request.body));
      response.status(201).json({ success: true, message: 'Tạo Claim thành công', data });
    },
    async mine(request, response) { response.json({ success: true, data: await service.mine(request.user) }); },
    async forItem(request, response) { response.json({ success: true, data: await service.forItem(request.user, positiveId(request.params.id)) }); },
    async approve(request, response) { response.json({ success: true, message: 'Duyệt Claim thành công', data: await service.approve(request.user, positiveId(request.params.id)) }); },
    async reject(request, response) { response.json({ success: true, message: 'Từ chối Claim thành công', data: await service.reject(request.user, positiveId(request.params.id)) }); },
    async complete(request, response) { response.json({ success: true, message: 'Hoàn tất Claim thành công', data: await service.complete(request.user, positiveId(request.params.id)) }); }
  };
}
