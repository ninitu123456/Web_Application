import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';

export function healthRoutes(service) {
  const router = Router();
  router.get('/health', createHealthController(service));
  return router;
}
