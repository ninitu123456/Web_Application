import { Router } from 'express';
import { healthRoutes } from './health.routes.js';

export function apiRoutes(healthService) {
  const router = Router();
  router.use(healthRoutes(healthService));
  return router;
}
