import { HttpError } from '../utils/http-error.js';

export function createLookupController(service) {
  const list = (kind) => async (request, response) => {
    if (Object.keys(request.query).length) throw new HttpError(400, 'Dữ liệu yêu cầu không hợp lệ');
    response.set('Cache-Control', 'no-store').json({ success: true, data: await service[kind]() });
  };
  return { categories: list('categories'), locations: list('locations') };
}
