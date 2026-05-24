import { describe, it, expect } from 'vitest';
import { parseDID, DIDMethod } from '../methods.js';
import { DIDError } from '../error.js';

describe('parseDID', () => {
  it('parses a simple did:key', () => {
    const result = parseDID('did:key:z6Mkq7P7P7P7');
    expect(result.method).toBe(DIDMethod.Key);
    expect(result.methodSpecificId).toBe('z6Mkq7P7P7P7');
  });

  it('parses a did:web with domain', () => {
    const result = parseDID('did:web:example.com');
    expect(result.method).toBe(DIDMethod.Web);
    expect(result.methodSpecificId).toBe('example.com');
  });

  it('parses a did:web with port', () => {
    const result = parseDID('did:web:example.com%3A3000');
    expect(result.method).toBe(DIDMethod.Web);
    expect(result.methodSpecificId).toBe('example.com%3A3000');
  });

  it('parses a did:ethr with address', () => {
    const result = parseDID('did:ethr:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(result.method).toBe(DIDMethod.Ethr);
    expect(result.methodSpecificId).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('parses a did:ethr with chain ID and address', () => {
    const result = parseDID('did:ethr:5:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(result.method).toBe(DIDMethod.Ethr);
    expect(result.methodSpecificId).toBe('5:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('throws for missing scheme prefix', () => {
    expect(() => parseDID('key:z6Mkq')).toThrow(DIDError);
  });

  it('throws for empty method', () => {
    expect(() => parseDID('did::')).toThrow(DIDError);
  });

  it('throws for empty method specific id', () => {
    expect(() => parseDID('did:key:')).toThrow(DIDError);
  });

  it('handles a complex method with colons in the MSI', () => {
    const result = parseDID('did:example:method:sub:123');
    expect(result.method).toBe(DIDMethod.Example);
    expect(result.methodSpecificId).toBe('method:sub:123');
  });

  it('rejects an empty DID string', () => {
    expect(() => parseDID('')).toThrow(DIDError);
  });

  it('rejects a string without did prefix', () => {
    expect(() => parseDID('did.other:method:123')).toThrow(DIDError);
  });

  it('preserves case in method specific id', () => {
    const result = parseDID('did:key:zMixedCaseABC123');
    expect(result.method).toBe(DIDMethod.Key);
    expect(result.methodSpecificId).toBe('zMixedCaseABC123');
  });
});
