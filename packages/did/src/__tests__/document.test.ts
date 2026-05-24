import { describe, it, expect } from 'vitest';
import { DIDDocument } from '../document.js';
import { Service } from '../service.js';
import { VerificationMethod } from '../verification.js';
import { DIDError, DIDErrorCode } from '../error.js';

describe('DIDDocument', () => {
  it('creates a document with the given id', () => {
    const doc = new DIDDocument('did:example:123');
    expect(doc.id).toBe('did:example:123');
    expect(doc.context).toContain('https://www.w3.org/ns/did/v1');
  });

  it('starts with empty verification methods', () => {
    const doc = new DIDDocument('did:example:abc');
    expect(doc.verificationMethod).toHaveLength(0);
    expect(doc.authentication).toHaveLength(0);
    expect(doc.service).toHaveLength(0);
  });

  it('adds a verification method and links it to authentication', () => {
    const doc = new DIDDocument('did:example:key1');
    const vm = new VerificationMethod({
      id: 'did:example:key1#key-1',
      type: 'Ed25519VerificationKey2020',
      controller: 'did:example:key1',
      publicKeyMultibase: 'z6Mkq7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P7P',
    });

    doc.addVerificationMethod(vm);
    expect(doc.verificationMethod).toHaveLength(1);
    expect(doc.verificationMethod[0].id).toBe('did:example:key1#key-1');
    expect(doc.authentication).toContain('did:example:key1#key-1');
  });

  it('adds a service', () => {
    const doc = new DIDDocument('did:example:svc1');
    const svc = new Service({
      id: 'did:example:svc1#hub',
      type: 'DIDComm',
      serviceEndpoint: 'https://hub.example.com',
    });

    doc.addService(svc);
    expect(doc.service).toHaveLength(1);
    expect(doc.service[0].id).toBe('did:example:svc1#hub');
    expect(doc.service[0].serviceEndpoint).toBe('https://hub.example.com');
  });

  it('validates a well-formed DID', () => {
    const doc = new DIDDocument('did:key:z6Mkq7P7');
    doc.addVerificationMethod(
      new VerificationMethod({
        id: 'did:key:z6Mkq7P7#key',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:key:z6Mkq7P7',
      }),
    );
    expect(doc.validate()).toBe(true);
  });

  it('throws on invalid DID id prefix', () => {
    const doc = new DIDDocument('invalid-did');
    expect(() => doc.validate()).toThrow(DIDError);
    expect(() => doc.validate()).toThrow(DIDErrorCode.InvalidDID);
  });

  it('throws on verification method with empty controller', () => {
    const doc = new DIDDocument('did:example:empty');
    doc.addVerificationMethod({
      id: 'did:example:empty#key',
      type: 'Ed25519VerificationKey2020',
      controller: '',
    } as any);

    expect(() => doc.validate()).toThrow(DIDError);
    expect(() => doc.validate()).toThrow(DIDErrorCode.InvalidVerificationMethod);
  });

  it('serializes to JSON', () => {
    const doc = new DIDDocument('did:example:json');
    doc.created = '2024-01-01T00:00:00Z';
    doc.addVerificationMethod(
      new VerificationMethod({
        id: 'did:example:json#key',
        type: 'Ed25519VerificationKey2020',
        controller: 'did:example:json',
        publicKeyMultibase: 'z6Mkq',
      }),
    );

    const json = doc.toJSON();
    expect(json.id).toBe('did:example:json');
    expect(json['@context']).toBeDefined();
    expect(json.verificationMethod).toHaveLength(1);
    expect(json.created).toBe('2024-01-01T00:00:00Z');
  });

  it('deserializes from JSON', () => {
    const data = {
      id: 'did:web:example.com',
      controller: ['did:web:example.com'],
      alsoKnownAs: ['https://example.com'],
      created: '2024-06-15T12:00:00Z',
    };

    const doc = DIDDocument.fromJSON(data);
    expect(doc.id).toBe('did:web:example.com');
    expect(doc.controller).toEqual(['did:web:example.com']);
    expect(doc.alsoKnownAs).toEqual(['https://example.com']);
    expect(doc.created).toBe('2024-06-15T12:00:00Z');
  });

  it('handles verification method with service endpoints', () => {
    const doc = new DIDDocument('did:example:full');
    const vm = new VerificationMethod({
      id: 'did:example:full#key-1',
      type: 'Ed25519VerificationKey2020',
      controller: 'did:example:full',
      publicKeyMultibase: 'z6Mkq',
    });
    doc.addVerificationMethod(vm);

    const svc = new Service({
      id: 'did:example:full#svc-1',
      type: 'LinkedDomains',
      serviceEndpoint: 'https://example.com',
    });
    doc.addService(svc);

    vm.fromEd25519(vm.id, vm.controller, new Uint8Array([1, 2, 3]));
  });
});
