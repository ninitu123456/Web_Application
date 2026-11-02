import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';
import { createAdminController } from '../controllers/admin.controller.js';
export function adminRoutes(auth, service) {
  const router = Router(), controller = createAdminController(service);
  router.use(authenticate(auth), authorizeRoles('ADMIN'));
  router.get('/claims', controller.listClaims);
  router.patch('/claims/:id/resolve', controller.resolveClaim);
  router.get('/activity-logs', controller.activityLogs);
  router.patch('/items/:id/close', controller.moderateClose);
  router.get('/dashboard', controller.dashboard);
  router.get('/users', controller.listUsers); router.get('/users/:id', controller.getUser); router.patch('/users/:id/status', controller.setUserStatus);
  router.get('/items', controller.listItems); router.get('/items/:id', controller.getItem); router.patch('/items/:id/status', controller.setItemStatus);
  for (const kind of ['categories', 'locations']) {
    router.get(`/${kind}`, controller.listLookup(kind)); router.post(`/${kind}`, controller.createLookup(kind));
    router.patch(`/${kind}/:id`, controller.updateLookup(kind)); router.delete(`/${kind}/:id`, controller.deleteLookup(kind));
  }
  return router;
}
