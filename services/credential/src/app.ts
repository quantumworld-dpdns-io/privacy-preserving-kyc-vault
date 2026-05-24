import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/error-handler.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createLoggingMiddleware } from './middleware/logging.js';
import { createAuditMiddleware } from './middleware/audit.js';
import { createCompressionMiddleware } from './middleware/compression.js';
import { createCacheMiddleware } from './middleware/cache.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { createSecurityHeadersMiddleware } from './middleware/security-headers.js';
import { tokenBucket } from './middleware/rate-limit.js';
import { getConfig } from './config.js';

import didRoutes from './routes/did.js';
import credentialRoutes from './routes/credential.js';
import kycRoutes from './routes/kyc.js';
import billingRoutes from './routes/billing.js';
import aiRoutes from './routes/ai.js';
import commerceRoutes from './routes/commerce.js';
import adminRoutes from './routes/admin.js';
import complianceRoutes from './routes/compliance.js';
import notificationRoutes from './routes/notifications.js';
import analyticsRoutes from './routes/analytics.js';
import healthRoutes from './routes/health.js';
import sseRoutes from './routes/sse.js';

export function createApp(): express.Application {
  const app = express();
  const config = getConfig();

  app.set('trust proxy', 1);

  app.use(createSecurityHeadersMiddleware());
  app.use(helmet());
  app.use(createCorsMiddleware({
    allowedOrigins: config.corsOrigins,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(createCompressionMiddleware());
  app.use(createLoggingMiddleware({ level: config.logLevel as any }));

  app.use(tokenBucket({
    windowMs: config.rateLimitWindowMs,
    maxRequests: config.rateLimitMax,
  }));

  app.use(createAuthMiddleware({
    jwtSecret: config.jwtSecret,
    skipPaths: ['/health', '/ready', '/api/v1/did/resolve', '/sse'],
  }));

  app.use(createAuditMiddleware());
  app.use(createCacheMiddleware({ ttlSeconds: 60 }));

  app.use('/api/v1/did', didRoutes);
  app.use('/api/v1/credentials', credentialRoutes);
  app.use('/api/v1/kyc', kycRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/ai', aiRoutes);
  app.use('/api/v1/commerce', commerceRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/compliance', complianceRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/sse', sseRoutes);
  app.use('/', healthRoutes);

  app.use(errorHandler);

  return app;
}
