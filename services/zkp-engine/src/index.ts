import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import { zkpRouter } from './handler.js';

const config = loadConfig();
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/api/v1/zkp', zkpRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'zkp-engine', timestamp: new Date().toISOString() });
});

app.listen(config.port, config.host, () => {
  console.log(`ZKP engine service listening on ${config.host}:${config.port}`);
});

export { app };
