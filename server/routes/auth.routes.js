import { validateForgot, validateReset } from '../validation/auth.validation.js';
import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';

export function authRoutes(service, passwordReset) {
  const router = Router(), controller = createAuthController(service);
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  if (passwordReset) {
    router.post('/forgot-password', async (req, res) => {
      const message = await passwordReset.forgot(validateForgot(req.body));
      res.json({ success: true, message, data: null });
    });
    router.post('/reset-password', async (req, res) => {
      await passwordReset.reset(validateReset(req.body));
      res.json({ success: true, message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.', data: null });
    });
  }
  return router;
}
