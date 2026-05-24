import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import { webhookRouter } from './handler.js';

const config = loadConfig();
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/v1/webhooks', webhookRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'webhook-relay', timestamp: new Date().toISOString() });
});

app.listen(config.port, config.host, () => {
  console.log(`Webhook relay service listening on ${config.host}:${config.port}`);
});

export { app };
