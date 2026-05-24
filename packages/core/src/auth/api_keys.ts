import * as crypto from 'node:crypto';

const API_KEY_PREFIX = 'kyc_';
const API_KEY_BYTES = 32;
const HASH_ALGORITHM = 'sha256';
const HASH_ITERATIONS = 100_000;
const HASH_KEY_LENGTH = 64;

export interface ApiKey {
  id: string;
  keyPrefix: string;
  hash: string;
  salt: string;
  name: string;
  permissions: string[];
  metadata?: Record<string, unknown>;
  expiresAt: number | null;
  createdAt: number;
  lastUsedAt: number | null;
  enabled: boolean;
}

export interface ApiKeyCreateInput {
  name: string;
  permissions: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: number;
}

export interface ApiKeyCreateResult {
  apiKey: ApiKey;
  rawKey: string;
}

export function generateApiKey(): string {
  const bytes = crypto.randomBytes(API_KEY_BYTES);
  const encoded = bytes.toString('base64url');
  return `${API_KEY_PREFIX}${encoded}`;
}

export function hashApiKey(rawKey: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(rawKey, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString('hex');
  return { hash, salt };
}

export function verifyApiKey(rawKey: string, hash: string, salt: string): boolean {
  const computed = crypto
    .pbkdf2Sync(rawKey, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM)
    .toString('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export function createApiKey(input: ApiKeyCreateInput): ApiKeyCreateResult {
  const rawKey = generateApiKey();
  const { hash, salt } = hashApiKey(rawKey);
  const id = crypto.randomUUID();

  const apiKey: ApiKey = {
    id,
    keyPrefix: rawKey.slice(0, 8),
    hash,
    salt,
    name: input.name,
    permissions: input.permissions,
    metadata: input.metadata,
    expiresAt: input.expiresAt ?? null,
    createdAt: Date.now(),
    lastUsedAt: null,
    enabled: true,
  };

  return { apiKey, rawKey };
}

export function maskApiKey(rawKey: string): string {
  if (rawKey.length <= 8) return rawKey;
  return `${rawKey.slice(0, 4)}${'*'.repeat(rawKey.length - 8)}${rawKey.slice(-4)}`;
}

export function isApiKeyExpired(apiKey: ApiKey): boolean {
  if (apiKey.expiresAt === null) return false;
  return Date.now() > apiKey.expiresAt;
}

export function validateKeyPrefix(rawKey: string): boolean {
  return rawKey.startsWith(API_KEY_PREFIX) && rawKey.length > API_KEY_PREFIX.length;
}

export function updateApiKeyUsage(apiKey: ApiKey): ApiKey {
  return {
    ...apiKey,
    lastUsedAt: Date.now(),
  };
}

export function rotateApiKey(apiKey: ApiKey, newName?: string): ApiKeyCreateResult {
  const result = createApiKey({
    name: newName ?? apiKey.name,
    permissions: apiKey.permissions,
    metadata: apiKey.metadata,
    expiresAt: apiKey.expiresAt ?? undefined,
  });
  return result;
}

export interface ApiKeyStore {
  getById(id: string): Promise<ApiKey | null>;
  getByKeyPrefix(prefix: string): Promise<ApiKey | null>;
  save(apiKey: ApiKey): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<ApiKey[]>;
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  private keys = new Map<string, ApiKey>();

  async getById(id: string): Promise<ApiKey | null> {
    return this.keys.get(id) ?? null;
  }

  async getByKeyPrefix(prefix: string): Promise<ApiKey | null> {
    for (const key of this.keys.values()) {
      if (key.keyPrefix === prefix) return key;
    }
    return null;
  }

  async save(apiKey: ApiKey): Promise<void> {
    this.keys.set(apiKey.id, apiKey);
  }

  async delete(id: string): Promise<void> {
    this.keys.delete(id);
  }

  async list(): Promise<ApiKey[]> {
    return Array.from(this.keys.values());
  }
}
