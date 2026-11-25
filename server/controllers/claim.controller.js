import { positiveId, validateCreateClaim } from '../validation/claim.validation.js';
import { appointmentInput, disputeInput } from '../validation/engagement.validation.js';
import { listPagination } from '../validation/list-pagination.js';

export function createClaimController(service) {
  return {
    async create(request, response) {
      const data = await service.create(request.user, positiveId(request.params.id), validateCreateClaim(request.body));
      response.status(201).json({ success: true, message: 'Tạo Claim thành công', data });
    },
    async mine(request, response) { response.json({ success: true, ...await service.mine(request.user, listPagination(request.query)) }); },
    async forItem(request, response) { response.json({ success: true, ...await service.forItem(request.user, positiveId(request.params.id), listPagination(request.query)) }); },
    async approve(request, response) { response.json({ success: true, message: 'Duyệt Claim thành công', data: await service.approve(request.user, positiveId(request.params.id)) }); },
    async reject(request, response) { response.json({ success: true, message: 'Từ chối Claim thành công', data: await service.reject(request.user, positiveId(request.params.id)) }); },
    async handover(request, response) { response.json({ success: true, data: await service.handover(request.user, positiveId(request.params.id)) }); },
    async propose(request, response) { response.json({ success: true, message: 'Đã gửi lịch hẹn', data: await service.proposeAppointment(request.user, positiveId(request.params.id), appointmentInput(request.body)) }); },
    async accept(request, response) { response.json({ success: true, message: 'Đã xác nhận lịch hẹn', data: await service.acceptAppointment(request.user, positiveId(request.params.id)) }); },
    async confirm(request, response) { response.json({ success: true, message: 'Đã xác nhận bàn giao', data: await service.confirmHandover(request.user, positiveId(request.params.id)) }); },
    async dispute(request, response) { response.json({ success: true, message: 'Đã gửi khiếu nại', data: await service.disputeHandover(request.user, positiveId(request.params.id), disputeInput(request.body)) }); },
    async complete(request, response) { response.json({ success: true, message: 'Hoàn tất Claim thành công', data: await service.complete(request.user, positiveId(request.params.id)) }); }
  };
}
