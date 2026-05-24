import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import didRoutes from './routes/did';
import { setupMiddleware } from './middleware';
import { setupErrorHandling } from './middleware/error-handler';
import { setupHealthChecks } from './routes/health';
import { connectRedis } from './config/redis';
import { logger } from './config/logger';

dotenv.load();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Setup custom middleware
setupMiddleware(app);

// Routes
app.use('/health', setupHealthChecks());
app.use('/api/v1/did', didRoutes);

// Error handling
setupErrorHandling(app);

// Connect to Redis
connectRedis().then(() => {
  logger.info('Connected to Redis');
}).catch((error) => {
  logger.error('Failed to connect to Redis:', error);
});

// Start server
const server = app.listen(port, () => {
  logger.info(`DID Service running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

export default app;
