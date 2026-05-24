import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import { credentialRouter } from './handler.js';

const config = loadConfig();
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/v1/credentials', credentialRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'credential-issuer', timestamp: new Date().toISOString() });
});

app.listen(config.port, config.host, () => {
  console.log(`Credential issuer service listening on ${config.host}:${config.port}`);
});

export { app };
