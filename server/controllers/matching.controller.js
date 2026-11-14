import { positiveId } from '../validation/item.validation.js';
import { listPagination } from '../validation/list-pagination.js';

export function createMatchingController(service) {
  return async (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ success: true, ...await service.listForOwner(request.user, positiveId(request.params.id), listPagination(request.query)) });
  };
}
