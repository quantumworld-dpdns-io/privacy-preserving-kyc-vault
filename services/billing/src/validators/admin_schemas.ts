import { z } from 'zod';

export const UserRole = ['admin', 'operator', 'analyst', 'viewer', 'auditor'] as const;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(UserRole),
  name: z.string().min(1).max(200),
  permissions: z.array(z.string()).default([]),
});

export const UpdateUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email().optional(),
  role: z.enum(UserRole).optional(),
  name: z.string().min(1).max(200).optional(),
  permissions: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const PlatformConfigSchema = z.object({
  platformId: z.string().min(1),
  name: z.string().min(1).optional(),
  settings: z.record(z.unknown()).optional(),
  features: z.array(z.string()).optional(),
  tier: z.enum(['basic', 'standard', 'enterprise']).optional(),
  webhookUrl: z.string().url().optional(),
  rateLimitMultiplier: z.number().positive().optional(),
});

export const SystemConfigSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
  environment: z.string().optional(),
});

export const AdminQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(UserRole).optional(),
  enabled: z.coerce.boolean().optional(),
});
