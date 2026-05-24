import * as crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface SessionData {
  userId: string;
  did?: string;
  roles: string[];
  permissions: string[];
  metadata?: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number;
}

export interface EncryptedSession {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface SessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, data: SessionData, ttlMs: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export class SessionManager {
  private encryptionKey: Buffer;
  private store: SessionStore;

  constructor(encryptionKey: string | Buffer, store: SessionStore) {
    if (typeof encryptionKey === 'string') {
      this.encryptionKey = crypto.scryptSync(encryptionKey, 'session-salt', KEY_LENGTH);
    } else {
      this.encryptionKey = encryptionKey;
    }
    this.store = store;
  }

  encrypt(sessionData: SessionData): EncryptedSession {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const plaintext = Buffer.from(JSON.stringify(sessionData), 'utf-8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64url'),
      iv: iv.toString('base64url'),
      tag: tag.toString('base64url'),
    };
  }

  decrypt(encrypted: EncryptedSession): SessionData | null {
    try {
      const iv = Buffer.from(encrypted.iv, 'base64url');
      const tag = Buffer.from(encrypted.tag, 'base64url');
      const ciphertext = Buffer.from(encrypted.ciphertext, 'base64url');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(decrypted.toString('utf-8'));
    } catch {
      return null;
    }
  }

  createSessionToken(sessionData: SessionData): string {
    const encrypted = this.encrypt(sessionData);
    const header = Buffer.from(JSON.stringify({ typ: 'session-v1' })).toString('base64url');
    return `${header}.${encrypted.iv}.${encrypted.ciphertext}.${encrypted.tag}`;
  }

  parseSessionToken(token: string): SessionData | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 4) return null;
      return this.decrypt({
        iv: parts[1]!,
        ciphertext: parts[2]!,
        tag: parts[3]!,
      });
    } catch {
      return null;
    }
  }

  async createSession(
    userId: string,
    roles: string[],
    permissions: string[],
    ttlMs: number = 3600_000,
    opts?: { did?: string; metadata?: Record<string, unknown> },
  ): Promise<{ sessionId: string; token: string }> {
    const now = Date.now();
    const sessionData: SessionData = {
      userId,
      did: opts?.did,
      roles,
      permissions,
      metadata: opts?.metadata,
      issuedAt: now,
      expiresAt: now + ttlMs,
    };
    const sessionId = crypto.randomUUID();
    const token = this.createSessionToken(sessionData);
    await this.store.set(sessionId, sessionData, ttlMs);
    return { sessionId, token };
  }

  async validateSession(token: string): Promise<SessionData | null> {
    const data = this.parseSessionToken(token);
    if (!data) return null;
    if (Date.now() > data.expiresAt) return null;
    return data;
  }

  async refreshSession(sessionId: string, token: string, ttlMs: number = 3600_000): Promise<{ sessionId: string; token: string } | null> {
    const data = await this.validateSession(token);
    if (!data) return null;
    const newSessionData: SessionData = {
      ...data,
      issuedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    const newToken = this.createSessionToken(newSessionData);
    await this.store.set(sessionId, newSessionData, ttlMs);
    return { sessionId, token: newToken };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
  }
}

export class InMemorySessionStore implements SessionStore {
  private store = new Map<string, { data: SessionData; ttlMs: number }>();
  private timers = new Map<string, NodeJS.Timeout>();

  async get(sessionId: string): Promise<SessionData | null> {
    const entry = this.store.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.data.expiresAt) {
      this.store.delete(sessionId);
      return null;
    }
    return entry.data;
  }

  async set(sessionId: string, data: SessionData, ttlMs: number): Promise<void> {
    this.store.set(sessionId, { data, ttlMs });
    const existing = this.timers.get(sessionId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.store.delete(sessionId);
        this.timers.delete(sessionId);
      }, ttlMs).unref(),
    );
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }
}
