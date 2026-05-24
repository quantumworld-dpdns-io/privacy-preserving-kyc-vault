import { Request, Response, NextFunction } from 'express';
import { DIDResolver, DIDDocument } from '@kyc-vault/did';
import * as crypto from 'node:crypto';

export interface AuthUser {
  id: string;
  method: 'did' | 'api_key' | 'jwt';
  did?: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export type AuthConfig = {
  jwtSecret?: string;
  apiKeyValidator?: (key: string) => Promise<{ id: string; permissions: string[] } | null>;
  skipPaths?: string[];
};

const DEFAULT_SKIP = ['/health', '/ready', '/api/v1/did/resolve'];

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

async function verifyDIDAuth(token: string, resolver: DIDResolver): Promise<AuthUser | null> {
  try {
    const [did, ...rest] = token.split(':');
    if (!did?.startsWith('did:')) return null;
    const doc = await resolver.resolve(did);
    const challenge = rest.join(':');
    if (!challenge) return null;
    const vmIds = doc.verificationMethod?.map((vm: any) => vm.id) ?? [];
    return {
      id: did,
      method: 'did',
      did,
      permissions: vmIds.map(() => 'authenticate'),
    };
  } catch {
    return null;
  }
}

async function verifyJWT(token: string, secret?: string): Promise<AuthUser | null> {
  if (!secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString('utf-8'),
    );
    const header = JSON.parse(
      Buffer.from(parts[0]!, 'base64url').toString('utf-8'),
    );
    const data = `${parts[0]}.${parts[1]}`;
    const sig = Buffer.from(parts[2]!, 'base64url');
    const key = crypto.createSecretKey(Buffer.from(secret, 'utf-8'));
    const expected = crypto
      .createHmac(header.alg?.startsWith('HS') ? 'sha256' : 'sha256', key)
      .update(data)
      .digest();
    if (!crypto.timingSafeEqual(sig, expected)) return null;
    if (payload.exp && Date.now() >= payload.exp * 1000) return null;
    return {
      id: payload.sub ?? payload.iss ?? 'unknown',
      method: 'jwt',
      permissions: payload.permissions ?? [],
    };
  } catch {
    return null;
  }
}

export function createAuthMiddleware(config: AuthConfig = {}) {
  const resolver = new DIDResolver();
  const skipPaths = [...DEFAULT_SKIP, ...(config.skipPaths ?? [])];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (skipPaths.some((p) => req.path.startsWith(p))) {
      return next();
    }

    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or malformed Authorization header',
      });
      return;
    }

    let user: AuthUser | null = null;

    if (token.startsWith('did:')) {
      user = await verifyDIDAuth(token, resolver);
    } else if (config.apiKeyValidator && token.length <= 128) {
      user = await config.apiKeyValidator(token);
      if (user) user = { ...user, method: 'api_key' };
    } else {
      user = await verifyJWT(token, config.jwtSecret);
    }

    if (!user) {
      res.status(401).json({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid or expired credentials',
      });
      return;
    }

    (req as AuthenticatedRequest).user = user;
    next();
  };
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Authentication required',
      });
      return;
    }
    const hasAll = permissions.every((p) => user.permissions.includes(p));
    if (!hasAll) {
      res.status(403).json({
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: `Missing required permissions: ${permissions.join(', ')}`,
      });
      return;
    }
    next();
  };
}
