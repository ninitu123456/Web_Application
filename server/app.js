import express from 'express';
import cors from 'cors';
import { defaultCorsOrigins } from './config/env.js';
import { apiRoutes } from './routes/index.js';
import { notFound } from './middleware/not-found.js';
import { createErrorHandler } from './middleware/error-handler.js';

export function createApp({ healthService, corsOrigins = defaultCorsOrigins, logger } = {}) {
  if (typeof healthService?.check !== 'function') throw new Error('A health service is required');
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin: corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'], credentials: false,
    optionsSuccessStatus: 204
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiRoutes(healthService));
  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}
