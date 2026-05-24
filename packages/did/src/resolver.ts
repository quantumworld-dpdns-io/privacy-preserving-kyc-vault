import { DIDDocument } from './document.js';
import { DIDError, DIDErrorCode } from './error.js';
import { DIDMethod, parseDID } from './methods.js';

export type ResolverMethod = (methodSpecificId: string) => Promise<DIDDocument>;

interface CacheEntry {
  doc: DIDDocument;
  cachedAt: number;
}

export class DIDResolver {
  private resolvers: Map<DIDMethod, ResolverMethod> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL: number;

  constructor(cacheTTLMs = 300_000) {
    this.cacheTTL = cacheTTLMs;
    this.registerDefaultResolvers();
  }

  private registerDefaultResolvers(): void {
    this.resolvers.set(DIDMethod.Key, async (msi: string) => {
      const did = `did:key:${msi}`;
      const doc = new DIDDocument(did);
      const vmId = `${did}#${msi}`;
      doc.addVerificationMethod({
        id: vmId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: msi,
      } as any);
      doc.created = new Date().toISOString();
      return doc;
    });

    this.resolvers.set(DIDMethod.Web, async (domain: string) => {
      const url = `https://${domain}/.well-known/did.json`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        throw new DIDError(
          `did:web:${domain} not found`,
          DIDErrorCode.NotFound,
        );
      }
      const data = await resp.json();
      return DIDDocument.fromJSON(data);
    });

    this.resolvers.set(DIDMethod.Ethr, async (_msi: string) => {
      throw new DIDError(
        'did:ethr resolver requires Ethereum RPC access',
        DIDErrorCode.ResolutionError,
      );
    });
  }

  registerMethod(method: DIDMethod, resolver: ResolverMethod): void {
    this.resolvers.set(method, resolver);
  }

  async resolve(did: string): Promise<DIDDocument> {
    const cached = this.cache.get(did);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.doc;
    }

    const { method, methodSpecificId } = parseDID(did);
    const resolver = this.resolvers.get(method);

    if (!resolver) {
      throw new DIDError(
        `Unsupported DID method: ${method}`,
        DIDErrorCode.UnsupportedMethod,
      );
    }

    const doc = await resolver(methodSpecificId);

    this.cache.set(did, {
      doc,
      cachedAt: Date.now(),
    });

    return doc;
  }

  invalidateCache(did: string): void {
    this.cache.delete(did);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
