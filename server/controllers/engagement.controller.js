import { positiveId } from '../validation/item.validation.js';
import { listPagination } from '../validation/list-pagination.js';
import { contactInput, contactQuery } from '../validation/engagement.validation.js';
import { parse } from '../validation/workflow.validation.js';
import { z } from 'zod';

const disputeQuery = (query) => {
  const { status, ...rest } = query ?? {};
  return { ...listPagination(rest), status: parse(z.enum(['OPEN', 'RESOLVED']).default('OPEN'), status) };
};
export function createEngagementController(service) {
  return {
    async save(request, response) { response.json({ success: true, data: await service.save(request.user, positiveId(request.params.id)) }); },
    async unsave(request, response) { response.json({ success: true, data: await service.unsave(request.user, positiveId(request.params.id)) }); },
    async savedIds(request, response) { response.json({ success: true, data: await service.savedIds(request.user) }); },
    async listSaved(request, response) { response.json({ success: true, ...await service.listSaved(request.user, listPagination(request.query)) }); },
    async view(request, response) {
      const data = await service.recordView(request.user, positiveId(request.params.id), { ip: request.ip, userAgent: request.get('User-Agent') });
      response.json({ success: true, data });
    },
    async itemStats(request, response) { response.json({ success: true, data: await service.itemStats(request.user, positiveId(request.params.id)) }); },
    async userStats(request, response) { response.json({ success: true, data: await service.userStats(request.user) }); },
    async contact(request, response) {
      response.status(201).json({ success: true, message: 'Đã gửi liên hệ', data: await service.contact(request.user, contactInput(request.body)) });
    },
    async listContacts(request, response) { response.json({ success: true, ...await service.listContacts(request.user, contactQuery(request.query)) }); },
    async handleContact(request, response) { response.json({ success: true, data: await service.handleContact(request.user, positiveId(request.params.id)) }); },
    async listDisputes(request, response) { response.json({ success: true, ...await service.listDisputes(request.user, disputeQuery(request.query)) }); },
    async resolveDispute(request, response) { response.json({ success: true, data: await service.resolveDispute(request.user, positiveId(request.params.id)) }); }
  };
}
