import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

export function createServer() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    });
  });

  app.get('/ready', (_req, res) => {
    res.json({ status: 'ready' });
  });

  return app;
}
