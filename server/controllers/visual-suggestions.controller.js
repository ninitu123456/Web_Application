import { positiveId } from '../validation/item.validation.js';

export function createVisualSuggestionsController(service) {
  return async (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ success: true, data: await service.forOwner(request.user, positiveId(request.params.id)) });
  };
}
