import { chatRoutes } from './chat.routes.js';
import { Router } from 'express';
import { createLookupController } from '../controllers/lookup.controller.js';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { userRoutes } from './user.routes.js';
import { itemRoutes } from './item.routes.js';
import { claimRoutes } from './claim.routes.js';
import { notificationRoutes } from './notification.routes.js';
import { reportRoutes } from './report.routes.js';
import { adminRoutes } from './admin.routes.js';

export function apiRoutes(healthService, authService, userService, itemService, matchingService, claimService, notificationService, reportService, adminService, uploadLimiter, lookupService, visualSuggestionsService, chatService, passwordResetService) {
  const router = Router();
  if (lookupService) {
    const lookup = createLookupController(lookupService);
    router.get('/categories', lookup.categories);
    router.get('/locations', lookup.locations);
  }
  router.use(healthRoutes(healthService));
  if (authService && userService) {
    router.use('/auth', authRoutes(authService, passwordResetService));
    if (chatService) router.use('/conversations', chatRoutes(authService, chatService));
    router.use('/users', userRoutes(authService, userService));
    if (itemService) router.use('/items', itemRoutes(authService, itemService, matchingService, claimService, uploadLimiter, visualSuggestionsService));
    if (claimService) router.use('/claims', claimRoutes(authService, claimService));
    if (notificationService) router.use('/notifications', notificationRoutes(authService, notificationService));
    if (reportService) {
      router.use('/reports', reportRoutes(authService, reportService));
      router.use('/admin/reports', reportRoutes(authService, reportService, true));
    }
    if (adminService) router.use('/admin', adminRoutes(authService, adminService));
  }
  return router;
}
