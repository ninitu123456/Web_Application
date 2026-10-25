import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './user.routes.js';

export function apiRoutes(healthService, authService, userService) {
  const router = Router();
  router.use(healthRoutes(healthService));
  if (authService && userService) {
    router.use('/auth', authRoutes(authService));
    router.use('/users', userRoutes(authService, userService));
  }
  return router;
}
