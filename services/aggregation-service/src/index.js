import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import expressWinston from 'express-winston';
import winston from 'winston';
import { logger } from './logger/index.js';
import apiComposer from './apiComposer/index.js';
import rateLimiter from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectToRedis } from './utils/redis.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false,
}));

// Rate limiting
app.use(rateLimiter);

// API routes
app.use('/api', apiComposer);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Connect to Redis and start server
const startServer = async () => {
  try {
    await connectToRedis();
    app.listen(PORT, () => {
      logger.info(`Aggregation service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;