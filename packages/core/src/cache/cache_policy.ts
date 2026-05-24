export type EvictionPolicy = 'lru' | 'lfu' | 'ttl' | 'fifo' | 'random';

export interface PolicyConfig {
  policy: EvictionPolicy;
  maxSize: number;
  ttlMs?: number;
  maxMemoryBytes?: number;
}

export interface EvictionCandidate {
  key: string;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  expiresAt: number | null;
  size: number;
}

export abstract class CachePolicy {
  abstract name: EvictionPolicy;
  abstract selectVictim(candidates: EvictionCandidate[]): EvictionCandidate | null;
  abstract shouldEvict(stats: { size: number; memoryBytes: number }, config: PolicyConfig): boolean;
}

export class LRUPolicy extends CachePolicy {
  readonly name: EvictionPolicy = 'lru';

  selectVictim(candidates: EvictionCandidate[]): EvictionCandidate | null {
    if (candidates.length === 0) return null;
    return candidates.reduce((oldest, c) =>
      c.lastAccessedAt < oldest.lastAccessedAt ? c : oldest,
    );
  }

  shouldEvict(stats: { size: number; memoryBytes: number }, config: PolicyConfig): boolean {
    return stats.size >= config.maxSize;
  }
}

export class LFUPolicy extends CachePolicy {
  readonly name: EvictionPolicy = 'lfu';

  selectVictim(candidates: EvictionCandidate[]): EvictionCandidate | null {
    if (candidates.length === 0) return null;
    return candidates.reduce((least, c) =>
      c.accessCount < least.accessCount ? c : least,
    );
  }

  shouldEvict(stats: { size: number; memoryBytes: number }, config: PolicyConfig): boolean {
    return stats.size >= config.maxSize;
  }
}

export class TTLPolicy extends CachePolicy {
  readonly name: EvictionPolicy = 'ttl';

  selectVictim(candidates: EvictionCandidate[]): EvictionCandidate | null {
    const now = Date.now();
    const expired = candidates.filter((c) => c.expiresAt !== null && now >= c.expiresAt);
    if (expired.length > 0) {
      return expired.reduce((soonest, c) =>
        c.expiresAt! < soonest.expiresAt! ? c : soonest,
      );
    }
    return candidates.reduce((soonest, c) =>
      (c.expiresAt ?? Infinity) < (soonest.expiresAt ?? Infinity) ? c : soonest,
    );
  }

  shouldEvict(stats: { size: number; memoryBytes: number }, config: PolicyConfig): boolean {
    return stats.size >= config.maxSize;
  }
}

export class FIFOPolicy extends CachePolicy {
  readonly name: EvictionPolicy = 'fifo';

  selectVictim(candidates: EvictionCandidate[]): EvictionCandidate | null {
    if (candidates.length === 0) return null;
    return candidates.reduce((oldest, c) =>
      c.createdAt < oldest.createdAt ? c : oldest,
    );
  }

  shouldEvict(stats: { size: number; memoryBytes: number }, config: PolicyConfig): boolean {
    return stats.size >= config.maxSize;
  }
}

export class RandomPolicy extends CachePolicy {
  readonly name: EvictionPolicy = 'random';

  selectVictim(candidates: EvictionCandidate[]): EvictionCandidate | null {
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  shouldEvict(stats: { size: number; memoryBytes: number }, config: PolicyConfig): boolean {
    return stats.size >= config.maxSize;
  }
}

const policyRegistry: Record<EvictionPolicy, CachePolicy> = {
  lru: new LRUPolicy(),
  lfu: new LFUPolicy(),
  ttl: new TTLPolicy(),
  fifo: new FIFOPolicy(),
  random: new RandomPolicy(),
};

export function getPolicy(policy: EvictionPolicy): CachePolicy {
  return policyRegistry[policy];
}

export function registerPolicy(name: EvictionPolicy, policy: CachePolicy): void {
  policyRegistry[name] = policy;
}

export function listPolicies(): EvictionPolicy[] {
  return Object.keys(policyRegistry) as EvictionPolicy[];
}
