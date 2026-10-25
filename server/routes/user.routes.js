import { Router } from 'express';
import { createUserController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';

export function userRoutes(authService, userService) {
  const router = Router(), controller = createUserController(userService);
  router.use(authenticate(authService), authorizeRoles('USER', 'ADMIN'));
  router.get('/me', controller.getMe);
  router.patch('/me', controller.updateMe);
  return router;
}
