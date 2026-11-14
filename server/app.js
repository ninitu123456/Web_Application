import express from 'express';
import cors from 'cors';
import { defaultCorsOrigins } from './config/env.js';
import { apiRoutes } from './routes/index.js';
import { notFound } from './middleware/not-found.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { createSecurity } from './middleware/security.js';

export function createApp({ healthService, authService, userService, itemService, matchingService, claimService, notificationService, reportService, adminService, lookupService, visualSuggestionsService, suggestionsService, chatService, passwordResetService, corsOrigins = defaultCorsOrigins, logger, security } = {}) {
  if (typeof healthService?.check !== 'function') throw new Error('A health service is required');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  const protection = createSecurity(security);
  app.use(protection.headers);
  app.use(cors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], credentials: false,
    optionsSuccessStatus: 204
  }));
  app.use(['/api/auth', '/api/users', '/api/claims', '/api/items', '/api/notifications', '/api/reports', '/api/admin', '/api/conversations'], (request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', protection.api);
  app.use('/api/health', protection.health);
  app.use('/api/auth/login', protection.login);
  app.use('/api/auth/register', protection.register);
  app.use('/api/auth/forgot-password', protection.reset);
  app.use('/api/auth/reset-password', protection.reset);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiRoutes(healthService, authService, userService, itemService, matchingService, claimService, notificationService, reportService, adminService, protection.upload, lookupService, visualSuggestionsService, chatService, passwordResetService, suggestionsService));
  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}
