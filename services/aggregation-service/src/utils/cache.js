import redis from 'redis';
import { logger } from '../logger/index.js';

let redisClient;

export const connectToRedis = async () => {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redisClient.on('error', (err) => {
    logger.error('Redis Client Error', err);
  });

  await redisClient.connect();
  logger.info('Connected to Redis');
};

export const cache = {
  get: async (key) => {
    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }
    const value = await redisClient.get(key);
    return value ? value : null;
  },
  set: async (key, value, expireInSeconds) => {
    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }
    await redisClient.set(key, value, {
      EX: expireInSeconds,
    });
  },
  del: async (key) => {
    if (!redisClient) {
      throw new Error('Redis client not initialized');
    }
    await redisClient.del(key);
  },
};