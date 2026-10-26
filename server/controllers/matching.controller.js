import { positiveId } from '../validation/item.validation.js';

export function createMatchingController(service) {
  return async (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ success: true, data: await service.list(positiveId(request.params.id)) });
  };
}
