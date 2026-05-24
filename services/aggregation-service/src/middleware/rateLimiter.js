import rateLimit from 'express-rate-limit';
import { logger } from '../logger/index.js';

const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(options.windowMs / 1000)} seconds.`,
    });
  },
});

export default rateLimiter;