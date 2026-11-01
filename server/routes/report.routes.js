import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';
import { createReportController } from '../controllers/report.controller.js';

export function reportRoutes(auth, service, admin = false) {
  const router = Router(), controller = createReportController(service);
  router.use(authenticate(auth), authorizeRoles(...(admin ? ['ADMIN'] : ['USER', 'ADMIN'])));
  if (admin) { router.get('/', controller.list); router.get('/:id', controller.get); router.patch('/:id', controller.update); }
  else { router.post('/', controller.create); router.get('/mine', controller.mine); }
  return router;
}
