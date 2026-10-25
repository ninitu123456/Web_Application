import { validateRegister, validateLogin } from '../validation/auth.validation.js';

export function createAuthController(service) {
  return {
    async register(request, response) {
      const data = await service.register(validateRegister(request.body));
      response.status(201).json({ success: true, message: 'Đăng ký thành công', data });
    },
    async login(request, response) {
      const data = await service.login(validateLogin(request.body));
      response.json({ success: true, message: 'Đăng nhập thành công', data });
    }
  };
}
