import { validateProfile } from '../validation/auth.validation.js';

export function createUserController(service) {
  return {
    getMe(request, response) { response.json({ success: true, data: service.getMe(request.user) }); },
    async updateMe(request, response) {
      const data = await service.updateMe(request.user, validateProfile(request.body));
      response.json({ success: true, message: 'Cập nhật hồ sơ thành công', data });
    }
  };
}
