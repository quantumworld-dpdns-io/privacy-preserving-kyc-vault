import { Request, Response, NextFunction } from 'express';
import * as crypto from 'node:crypto';
import { AuthenticatedRequest } from './auth.js';

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'verify'
  | 'issue'
  | 'revoke'
  | 'export';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditEvent {
  auditId: string;
  timestamp: string;
  action: AuditAction;
  severity: AuditSeverity;
  actorId: string;
  actorType: string;
  resourceType: string;
  resourceId?: string;
  ip: string;
  userAgent: string;
  success: boolean;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditTransport {
  write(event: AuditEvent): Promise<void> | void;
}

export type AuditConfig = {
  transport?: AuditTransport;
  sensitivePaths?: string[];
  excludePaths?: string[];
};

const SENSITIVE_ACTIONS: Record<string, { action: AuditAction; severity: AuditSeverity }> = {
  POST: { action: 'create', severity: 'medium' },
  PUT: { action: 'update', severity: 'medium' },
  PATCH: { action: 'update', severity: 'medium' },
  DELETE: { action: 'delete', severity: 'high' },
};

const SENSITIVE_PATTERNS = [
  /\/credentials\/issue/,
  /\/credentials\/verify/,
  /\/credentials\/revoke/,
  /\/kyc\/workflows/,
  /\/did\/resolve\/batch/,
  /\/auth\//,
  /\/admin\//,
];

class ConsoleAuditTransport implements AuditTransport {
  write(event: AuditEvent): void {
    console.log(JSON.stringify({ type: 'audit', ...event }));
  }
}

let globalTransport: AuditTransport = new ConsoleAuditTransport();

export function setAuditTransport(transport: AuditTransport): void {
  globalTransport = transport;
}

function determineSensitivity(
  method: string,
  path: string,
): { action: AuditAction; severity: AuditSeverity } | null {
  const matched = SENSITIVE_PATTERNS.some((p) => p.test(path));
  if (!matched) return null;
  return SENSITIVE_ACTIONS[method] ?? { action: 'read', severity: 'low' };
}

function extractResourceType(path: string): string {
  const parts = path.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    if (['did', 'credentials', 'kyc', 'admin', 'auth'].includes(parts[i]!)) {
      return parts[i]!;
    }
  }
  return 'unknown';
}

export function createAuditMiddleware(config: AuditConfig = {}) {
  const transport = config.transport ?? globalTransport;
  const excludePaths = config.excludePaths ?? ['/health', '/ready'];

  return (req: Request, res: Response, next: NextFunction): void => {
    if (excludePaths.some((p) => req.path.startsWith(p))) {
      next();
      return;
    }

    const sensitivity = determineSensitivity(req.method, req.path);
    if (!sensitivity) {
      next();
      return;
    }

    const start = Date.now();
    const originalEnd = res.end.bind(res);

    res.end = function (this, ...args: any[]): any {
      const duration = Date.now() - start;
      const user = (req as AuthenticatedRequest).user;
      const event: AuditEvent = {
        auditId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: sensitivity.action,
        severity: sensitivity.severity,
        actorId: user?.id ?? req.ip ?? 'anonymous',
        actorType: user?.method ?? 'ip',
        resourceType: extractResourceType(req.path),
        resourceId: req.params.id,
        ip: req.ip ?? req.socket.remoteAddress ?? '',
        userAgent: req.headers['user-agent'] ?? '',
        success: res.statusCode < 400,
        detail: `${req.method} ${req.originalUrl ?? req.url} -> ${res.statusCode} (${duration}ms)`,
        metadata: {
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: duration,
        },
      };

      try {
        transport.write(event);
      } catch {
        void 0;
      }

      return originalEnd(...args);
    } as Response['end'];

    next();
  };
}
