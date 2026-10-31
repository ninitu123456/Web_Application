import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';
import { createNotificationController } from '../controllers/notification.controller.js';

export function notificationRoutes(auth, service) {
  const router = Router(), controller = createNotificationController(service);
  router.use(authenticate(auth), authorizeRoles('USER', 'ADMIN'));
  router.get('/', controller.list);
  router.get('/unread-count', controller.unread);
  router.patch('/read-all', controller.markAll);
  router.patch('/:id/read', controller.markRead);
  return router;
}
