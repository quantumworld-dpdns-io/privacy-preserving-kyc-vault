import { DIDMethod } from '@kyc-vault/did';

export interface MethodRegistryEntry {
  method: DIDMethod;
  resolverUrl?: string;
  local: boolean;
}

export interface CacheConfig {
  ttlMs: number;
  maxEntries: number;
  evictionPolicy: 'lru' | 'ttl' | 'none';
}

export interface DIDResolverConfig {
  port: number;
  host: string;
  cache: CacheConfig;
  methodRegistry: MethodRegistryEntry[];
  trustedDIDs: string[];
  maxResolutionDepth: number;
}

export function loadConfig(): DIDResolverConfig {
  const env = process.env;

  return {
    port: parseInt(env.DID_RESOLVER_PORT || '3010', 10),
    host: env.DID_RESOLVER_HOST || '0.0.0.0',
    cache: {
      ttlMs: parseInt(env.DID_CACHE_TTL_MS || '300000', 10),
      maxEntries: parseInt(env.DID_CACHE_MAX_ENTRIES || '10000', 10),
      evictionPolicy: (env.DID_CACHE_EVICTION_POLICY as CacheConfig['evictionPolicy']) || 'lru',
    },
    methodRegistry: [
      { method: DIDMethod.Key, local: true },
      { method: DIDMethod.Web, local: false },
      { method: DIDMethod.Ethr, local: false },
    ],
    trustedDIDs: (env.TRUSTED_DIDS || '').split(',').filter(Boolean),
    maxResolutionDepth: parseInt(env.DID_MAX_RESOLUTION_DEPTH || '10', 10),
  };
}
