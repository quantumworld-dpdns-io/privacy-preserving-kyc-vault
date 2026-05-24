import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadPlatformConfig } from './config.js';
import { OnlyFansAdapter } from './onlyfans.js';
import { FanslyAdapter } from './fansly.js';
import { ManyVidsAdapter } from './manyvids.js';
import { LoyalFansAdapter } from './loyalfans.js';
import { JustForFansAdapter } from './justforfans.js';
import { PlatformAdapter, PlatformConfig, WebhookPayload } from './interfaces.js';

const config = loadPlatformConfig();
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const adapters = new Map<string, PlatformAdapter>();

function initializeAdapters(): void {
  const adapterConfigs: [string, PlatformAdapter, PlatformConfig][] = [
    ['onlyfans', new OnlyFansAdapter(config), config.onlyfans],
    ['fansly', new FanslyAdapter(config), config.fansly],
    ['manyvids', new ManyVidsAdapter(config), config.manyvids],
    ['loyalfans', new LoyalFansAdapter(config), config.loyalfans],
    ['justforfans', new JustForFansAdapter(config), config.justforfans],
  ];

  for (const [name, adapter, platformConfig] of adapterConfigs) {
    if (platformConfig.enabled) {
      adapters.set(name, adapter);
      console.log(`[platform-adapter] Initialized ${name} adapter (sandbox: ${platformConfig.sandboxMode})`);
    }
  }
}

app.post('/api/v1/platform/:platform/initialize', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    await adapter.initialize(req.body.credentials);
    const valid = await adapter.validateCredentials();

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ status: 'ok', platform: req.params.platform, initialized: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/platform/:platform/profile/:userId', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const profile = await adapter.getProfile(req.params.userId);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/platform/:platform/:creatorId/subscriptions', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const subscriptions = await adapter.getSubscriptions(req.params.creatorId, page, limit);
    res.json(subscriptions);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/platform/:platform/:creatorId/payouts', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const payouts = await adapter.getPayouts(req.params.creatorId, page, limit);
    res.json(payouts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/platform/:platform/:creatorId/content', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const content = await adapter.getContent(req.params.creatorId, page, limit);
    res.json(content);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/v1/platform/:platform/:creatorId/metrics', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const { periodStart, periodEnd } = req.query;
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'periodStart and periodEnd query parameters are required' });
    }

    const metrics = await adapter.getMetrics(req.params.creatorId, periodStart as string, periodEnd as string);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/v1/platform/:platform/:creatorId/sync', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const result = await adapter.syncAll(req.params.creatorId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/v1/platform/:platform/webhook', async (req, res) => {
  try {
    const adapter = adapters.get(req.params.platform);
    if (!adapter) {
      return res.status(400).json({ error: `Unsupported platform: ${req.params.platform}` });
    }

    const payload = req.body as WebhookPayload;
    await adapter.handleWebhook(payload);
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'platform-adapter', timestamp: new Date().toISOString() });
});

initializeAdapters();

app.listen(config.server.port, config.server.host, () => {
  console.log(`Platform adapter service listening on ${config.server.host}:${config.server.port}`);
});

export { app, adapters };
