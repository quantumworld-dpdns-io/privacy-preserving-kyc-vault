import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import kycRoutes from './routes/kyc';
import { setupMiddleware } from './middleware';
import { setupErrorHandling } from './middleware/error-handler';
import { setupHealthChecks } from './routes/health';
import { connectRedis, connectMongoDB } from './config/database';
import { logger } from './config/logger';

dotenv.load();

const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup custom middleware
setupMiddleware(app);

// Routes
app.use('/health', setupHealthChecks());
app.use('/api/v1/kyc', kycRoutes);

// Error handling
setupErrorHandling(app);

// Connect to databases
Promise.all([
  connectRedis(),
  connectMongoDB()
]).then(([redisConnected, mongoConnected]) => {
  if (redisConnected && mongoConnected) {
    logger.info('Connected to Redis and MongoDB');
  } else {
    logger.warn('Some database connections failed');
  }
}).catch((error) => {
  logger.error('Failed to connect to databases:', error);
});

// Start server
const server = app.listen(port, () => {
  logger.info(`KYC Service running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

export default app;
