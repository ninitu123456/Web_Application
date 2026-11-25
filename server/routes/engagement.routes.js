import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';
import { createEngagementController } from '../controllers/engagement.controller.js';

export function engagementRoutes(authService, engagementService, contactLimiter = (_req, _res, next) => next()) {
  const router = Router(), controller = createEngagementController(engagementService);
  const user = [authenticate(authService), authorizeRoles('USER', 'ADMIN')];
  const admin = [authenticate(authService), authorizeRoles('ADMIN')];
  const optional = (req, res, next) => req.get('Authorization') === undefined ? next() : authenticate(authService)(req, res, next);
  router.get('/saved-items', ...user, controller.listSaved);
  router.get('/saved-items/ids', ...user, controller.savedIds);
  router.put('/saved-items/:id', ...user, controller.save);
  router.delete('/saved-items/:id', ...user, controller.unsave);
  router.post('/items/:id/views', optional, controller.view);
  router.get('/items/:id/stats', ...user, controller.itemStats);
  router.get('/users/me/stats', ...user, controller.userStats);
  router.post('/contact', contactLimiter, optional, controller.contact);
  router.get('/admin/contact-messages', ...admin, controller.listContacts);
  router.patch('/admin/contact-messages/:id/handle', ...admin, controller.handleContact);
  router.get('/admin/handover-disputes', ...admin, controller.listDisputes);
  router.patch('/admin/handover-disputes/:id/resolve', ...admin, controller.resolveDispute);
  return router;
}
