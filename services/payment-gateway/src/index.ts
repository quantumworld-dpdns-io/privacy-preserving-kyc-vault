import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import { paymentRouter } from './handler.js';

const config = loadConfig();
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1/payments', paymentRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'payment-gateway', timestamp: new Date().toISOString() });
});

app.listen(config.port, config.host, () => {
  console.log(`Payment gateway service listening on ${config.host}:${config.port}`);
});

export { app };
