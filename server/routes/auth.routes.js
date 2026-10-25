import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';

export function authRoutes(service) {
  const router = Router(), controller = createAuthController(service);
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  return router;
}
