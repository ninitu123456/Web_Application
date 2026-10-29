import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import { itemRoutes } from './item.routes.js';
import { claimRoutes } from './claim.routes.js';

export function apiRoutes(healthService, authService, userService, itemService, matchingService, claimService) {
  const router = Router();
  router.use(healthRoutes(healthService));
  if (authService && userService) {
    router.use('/auth', authRoutes(authService));
    router.use('/users', userRoutes(authService, userService));
    if (itemService) router.use('/items', itemRoutes(authService, itemService, matchingService, claimService));
    if (claimService) router.use('/claims', claimRoutes(authService, claimService));
  }
  return router;
}
