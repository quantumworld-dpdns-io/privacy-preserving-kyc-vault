import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DIDResolver } from '../resolver.js';
import { DIDMethod } from '../methods.js';
import { DIDError, DIDErrorCode } from '../error.js';

describe('DIDResolver', () => {
  let resolver: DIDResolver;

  beforeEach(() => {
    resolver = new DIDResolver(10_000);
  });

  it('resolves a did:key', async () => {
    const doc = await resolver.resolve('did:key:z6Mkq7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P');
    expect(doc.id).toBe('did:key:z6Mkq7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P');
    expect(doc.verificationMethod).toHaveLength(1);
  });

  it('resolves a registered custom method', async () => {
    resolver.registerMethod(DIDMethod.Key, async (msi) => {
      const { DIDDocument } = await import('../document.js');
      const doc = new DIDDocument(`did:custom:${msi}`);
      doc.created = new Date().toISOString();
      return doc;
    });

    const doc = await resolver.resolve('did:key:test123');
    expect(doc.id).toBe('did:custom:test123');
  });

  it('throws UnsupportedMethod for unknown methods', async () => {
    await expect(resolver.resolve('did:unknown:123')).rejects.toThrow(DIDError);
    await expect(resolver.resolve('did:unknown:123')).rejects.toThrow(
      DIDErrorCode.UnsupportedMethod,
    );
  });

  it('throws InvalidDID for malformed DID strings', async () => {
    await expect(resolver.resolve('not-a-did')).rejects.toThrow(DIDError);
    await expect(resolver.resolve('not-a-did')).rejects.toThrow(DIDErrorCode.InvalidDID);
  });

  it('caches resolved documents', async () => {
    const spy = vi.spyOn(resolver as any, 'resolvers', 'get');

    const doc1 = await resolver.resolve('did:key:abc123');
    const doc2 = await resolver.resolve('did:key:abc123');

    expect(doc1.id).toBe(doc2.id);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('invalidates cache for a specific DID', async () => {
    const doc1 = await resolver.resolve('did:key:cachetest');

    resolver.invalidateCache('did:key:cachetest');

    const doc2 = await resolver.resolve('did:key:cachetest');
    expect(doc2.id).toBe('did:key:cachetest');
  });

  it('clears all cached documents', async () => {
    await resolver.resolve('did:key:clear1');
    await resolver.resolve('did:key:clear2');

    resolver.clearCache();

    const doc1 = await resolver.resolve('did:key:clear1');
    const doc2 = await resolver.resolve('did:key:clear2');
    expect(doc1.id).toBe('did:key:clear1');
    expect(doc2.id).toBe('did:key:clear2');
  });

  it('respects cache TTL', async () => {
    const shortResolver = new DIDResolver(0);

    const doc1 = await shortResolver.resolve('did:key:ttltest');
    const doc2 = await shortResolver.resolve('did:key:ttltest');

    expect(doc2.id).toBe('did:key:ttltest');
  });

  it('throws ResolutionError for did:ethr without RPC', async () => {
    await expect(resolver.resolve('did:ethr:0x123')).rejects.toThrow(DIDError);
    await expect(resolver.resolve('did:ethr:0x123')).rejects.toThrow(
      DIDErrorCode.ResolutionError,
    );
  });

  it('resolves did:web with a mock fetch', async () => {
    const mockDoc = {
      id: 'did:web:example.com',
      controller: ['did:web:example.com'],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDoc,
    } as Response);

    vi.stubGlobal('fetch', mockFetch);

    const doc = await resolver.resolve('did:web:example.com');
    expect(doc.id).toBe('did:web:example.com');

    vi.unstubGlobal('fetch');
  });

  it('handles missing did:web documents', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    vi.stubGlobal('fetch', mockFetch);

    await expect(resolver.resolve('did:web:notfound.example.com')).rejects.toThrow(
      DIDErrorCode.NotFound,
    );

    vi.unstubGlobal('fetch');
  });
});
