import { describe, it, expect } from 'vitest';
import { Service } from '../service.js';

describe('Service', () => {
  it('creates a service with id, type, and endpoint', () => {
    const svc = new Service({
      id: 'did:example:123#hub',
      type: 'DIDComm',
      serviceEndpoint: 'https://hub.example.com',
    });
    expect(svc.id).toBe('did:example:123#hub');
    expect(svc.type).toBe('DIDComm');
    expect(svc.serviceEndpoint).toBe('https://hub.example.com');
  });

  it('creates a service with no initial endpoints', () => {
    const svc = new Service({
      id: 'did:example:123#api',
      type: 'KYCVerificationService',
      serviceEndpoint: 'https://kyc.example.com/api',
    });
    expect(svc.endpoints).toEqual([]);
  });

  it('creates a service with multiple endpoints via constructor', () => {
    const svc = new Service({
      id: 'did:example:123#multi',
      type: 'LinkedDomains',
      serviceEndpoint: 'https://primary.example.com',
      endpoints: ['https://fallback.example.com', 'https://backup.example.com'],
    });
    expect(svc.endpoints).toHaveLength(2);
  });

  it('addEndpoint appends to the endpoints list', () => {
    const svc = new Service({
      id: 'did:example:123#hub',
      type: 'DIDCommHub',
      serviceEndpoint: 'https://hub1.example.com',
    });
    svc.addEndpoint('https://hub2.example.com');
    svc.addEndpoint('https://hub3.example.com');
    expect(svc.endpoints).toHaveLength(2);
    expect(svc.endpoints[0]).toBe('https://hub2.example.com');
    expect(svc.endpoints[1]).toBe('https://hub3.example.com');
  });

  it('toJSON serializes service with endpoints', () => {
    const svc = new Service({
      id: 'did:example:123#svc',
      type: 'DIDComm',
      serviceEndpoint: 'https://endpoint.example.com',
    });
    svc.addEndpoint('https://alt.example.com');
    const json = svc.toJSON();
    expect(json.id).toBe('did:example:123#svc');
    expect(json.type).toBe('DIDComm');
    expect(json.serviceEndpoint).toBe('https://endpoint.example.com');
    expect(json.endpoints).toEqual(['https://alt.example.com']);
  });

  it('toJSON omits endpoints when empty', () => {
    const svc = new Service({
      id: 'did:example:123#simple',
      type: 'KYCService',
      serviceEndpoint: 'https://kyc.example.com',
    });
    const json = svc.toJSON();
    expect(json.endpoints).toBeUndefined();
  });

  it('creating a service without serviceEndpoint is allowed', () => {
    const svc = new Service({
      id: 'did:example:123#placeholder',
      type: 'PlaceholderService',
    });
    expect(svc.serviceEndpoint).toBeUndefined();
    expect(svc.endpoints).toEqual([]);
  });

  it('multiple addEndpoint calls preserve order', () => {
    const svc = new Service({
      id: 'did:example:123#ordered',
      type: 'OrderedEndpoints',
    });
    svc.addEndpoint('first');
    svc.addEndpoint('second');
    svc.addEndpoint('third');
    expect(svc.endpoints).toEqual(['first', 'second', 'third']);
  });

  it('service type can be any string', () => {
    const svc = new Service({
      id: 'did:example:123#custom',
      type: 'CustomServiceType2025',
    });
    expect(svc.type).toBe('CustomServiceType2025');
  });

  it('serialization roundtrip preserves all fields', () => {
    const svc = new Service({
      id: 'did:example:123#roundtrip',
      type: 'KYCService',
      serviceEndpoint: 'https://api.example.com',
    });
    svc.addEndpoint('https://backup.example.com');

    const json = svc.toJSON();
    expect(json.id).toBe('did:example:123#roundtrip');
    expect(json.type).toBe('KYCService');
    expect(json.serviceEndpoint).toBe('https://api.example.com');
    expect(json.endpoints).toHaveLength(1);
  });
});
