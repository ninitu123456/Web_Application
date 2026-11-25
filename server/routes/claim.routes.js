import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize-roles.js';
import { createClaimController } from '../controllers/claim.controller.js';

export function claimRoutes(authService, claimService) {
  const router = Router(), controller = createClaimController(claimService);
  router.use(authenticate(authService), authorizeRoles('USER', 'ADMIN'));
  router.get('/mine', controller.mine);
  router.patch('/:id/approve', controller.approve);
  router.patch('/:id/reject', controller.reject);
  router.patch('/:id/complete', controller.complete);
  if (claimService.handover) {
    router.get('/:id/handover', controller.handover);
    router.put('/:id/handover/appointment', controller.propose);
    router.patch('/:id/handover/appointment/accept', controller.accept);
    router.patch('/:id/handover/confirm', controller.confirm);
    router.post('/:id/handover/dispute', controller.dispute);
  }
  return router;
}
