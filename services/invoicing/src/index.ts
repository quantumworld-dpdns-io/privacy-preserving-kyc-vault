import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import { invoiceRouter } from './handler.js';

const config = loadConfig();
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/api/v1/invoices', invoiceRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'invoicing', timestamp: new Date().toISOString() });
});

app.listen(config.port, config.host, () => {
  console.log(`Invoicing service listening on ${config.host}:${config.port}`);
});

export { app };
