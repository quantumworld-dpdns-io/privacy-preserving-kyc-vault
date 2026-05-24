import { Router, Request, Response } from 'express';

const router = Router();

interface DependencyStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  lastCheck: string;
  error?: string;
}

const dependencyChecks: Array<{ name: string; check: () => Promise<boolean> }> = [
  {
    name: 'database',
    check: async () => {
      if (!process.env.DATABASE_URL) return false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const url = new URL(process.env.DATABASE_URL!);
        const response = await fetch(`http://${url.hostname}:${url.port || '5432'}/healthz`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return response.ok;
      } catch {
        return false;
      }
    },
  },
  {
    name: 'redis',
    check: async () => {
      if (!process.env.REDIS_URL) return false;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const url = new URL(process.env.REDIS_URL!);
        const response = await fetch(`http://${url.hostname}:${url.port || '6379'}/ping`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        return response.ok;
      } catch {
        return false;
      }
    },
  },
  {
    name: 'ollama',
    check: async () => {
      try {
        const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
        const response = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3000) });
        return response.ok;
      } catch {
        return false;
      }
    },
  },
];

async function checkDependencies(): Promise<DependencyStatus[]> {
  return Promise.all(
    dependencyChecks.map(async (dep) => {
      const start = Date.now();
      try {
        const healthy = await dep.check();
        return {
          name: dep.name,
          status: healthy ? 'healthy' : 'degraded',
          latencyMs: Date.now() - start,
          lastCheck: new Date().toISOString(),
          ...(healthy ? {} : { error: 'Health check failed' }),
        };
      } catch (error) {
        return {
          name: dep.name,
          status: 'unhealthy',
          latencyMs: Date.now() - start,
          lastCheck: new Date().toISOString(),
          error: (error as Error).message,
        };
      }
    }),
  );
}

router.get('/health', async (_req: Request, res: Response) => {
  const start = Date.now();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpuUsage: process.cpuUsage(),
  });
});

router.get('/ready', async (_req: Request, res: Response) => {
  const dependencies = await checkDependencies();
  const allHealthy = dependencies.every((d) => d.status === 'healthy');
  const status = allHealthy ? 'ready' : 'degraded';

  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    checks: dependencies,
  });
});

router.get('/health/dependencies', async (_req: Request, res: Response) => {
  const dependencies = await checkDependencies();
  res.json({
    timestamp: new Date().toISOString(),
    dependencies,
  });
});

router.get('/health/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

export default router;
