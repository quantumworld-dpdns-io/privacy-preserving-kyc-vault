import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CreateUserSchema, UpdateUserSchema, PlatformConfigSchema, SystemConfigSchema, AdminQuerySchema } from '../validators/admin_schemas.js';

const router = Router();

interface User {
  id: string;
  email: string;
  role: string;
  name: string;
  permissions: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const users = new Map<string, User>();
const platformConfigs = new Map<string, Record<string, unknown>>();
const systemConfigs = new Map<string, unknown>();

router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = CreateUserSchema.parse(req.body);
    const id = `user-${crypto.randomUUID()}`;
    const user: User = {
      id,
      email: input.email,
      role: input.role,
      name: input.name,
      permissions: input.permissions,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    users.set(id, user);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = AdminQuerySchema.parse(req.query);
    let userList = Array.from(users.values());

    if (query.search) {
      const s = query.search.toLowerCase();
      userList = userList.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
    }
    if (query.role) {
      userList = userList.filter((u) => u.role === query.role);
    }
    if (query.enabled !== undefined) {
      userList = userList.filter((u) => u.enabled === query.enabled);
    }

    const total = userList.length;
    const start = (query.page - 1) * query.limit;
    const data = userList.slice(start, start + query.limit);

    res.json({ success: true, data, total, page: query.page, limit: query.limit });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = users.get(req.params.userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = UpdateUserSchema.parse({ ...req.body, userId: req.params.userId });
    const existing = users.get(input.userId);
    if (!existing) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const updated: User = {
      ...existing,
      ...(input.email ? { email: input.email } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.permissions ? { permissions: input.permissions } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedAt: new Date().toISOString(),
    };

    users.set(input.userId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.delete('/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!users.has(req.params.userId)) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    users.delete(req.params.userId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/platforms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = PlatformConfigSchema.parse(req.body);
    platformConfigs.set(input.platformId, input);
    res.status(201).json({ success: true, data: input });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/platforms', async (_req: Request, res: Response) => {
  res.json({ success: true, data: Array.from(platformConfigs.entries()).map(([id, config]) => ({ id, ...config })) });
});

router.get('/platforms/:platformId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = platformConfigs.get(req.params.platformId);
    if (!config) {
      res.status(404).json({ success: false, error: 'Platform not found' });
      return;
    }
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

router.put('/platforms/:platformId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = platformConfigs.get(req.params.platformId);
    if (!existing) {
      res.status(404).json({ success: false, error: 'Platform not found' });
      return;
    }
    const updated = { ...existing, ...req.body, platformId: req.params.platformId, updatedAt: new Date().toISOString() };
    platformConfigs.set(req.params.platformId, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/platforms/:platformId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!platformConfigs.has(req.params.platformId)) {
      res.status(404).json({ success: false, error: 'Platform not found' });
      return;
    }
    platformConfigs.delete(req.params.platformId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/config', async (_req: Request, res: Response) => {
  res.json({ success: true, data: Object.fromEntries(systemConfigs) });
});

router.put('/config/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = SystemConfigSchema.parse({ ...req.body, key: req.params.key });
    systemConfigs.set(input.key, input.value);
    res.json({ success: true, data: { key: input.key, value: input.value } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
      return;
    }
    next(error);
  }
});

router.get('/config/:key', async (req: Request, res: Response) => {
  const value = systemConfigs.get(req.params.key);
  if (value === undefined) {
    res.status(404).json({ success: false, error: 'Config key not found' });
    return;
  }
  res.json({ success: true, data: { key: req.params.key, value } });
});

export default router;
