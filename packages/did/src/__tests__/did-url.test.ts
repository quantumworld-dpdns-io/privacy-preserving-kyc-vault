import { describe, it, expect } from 'vitest';
import { DIDUrl } from '../did-url.js';

describe('DIDUrl', () => {
  it('parses a simple DID without fragment or query', () => {
    const url = DIDUrl.parse('did:key:z6Mkq7P7P7P7');
    expect(url.method).toBe('key');
    expect(url.methodSpecificId).toBe('z6Mkq7P7P7P7');
    expect(url.path).toBeUndefined();
    expect(url.query).toBeUndefined();
    expect(url.fragment).toBeUndefined();
  });

  it('parses a DID with fragment', () => {
    const url = DIDUrl.parse('did:key:z6Mkq7P7P7P7#key-1');
    expect(url.method).toBe('key');
    expect(url.methodSpecificId).toBe('z6Mkq7P7P7P7');
    expect(url.fragment).toBe('key-1');
  });

  it('parses a DID with query', () => {
    const url = DIDUrl.parse('did:key:z6Mkq7P7P7P7?service=hub&foo=bar');
    expect(url.method).toBe('key');
    expect(url.methodSpecificId).toBe('z6Mkq7P7P7P7');
    expect(url.query).toBe('service=hub&foo=bar');
  });

  it('parses a DID with path', () => {
    const url = DIDUrl.parse('did:web:example.com:path:to:resource');
    expect(url.method).toBe('web');
    expect(url.methodSpecificId).toBe('example.com');
    expect(url.path).toBe('path:to:resource');
  });

  it('parses a DID with path and query', () => {
    const url = DIDUrl.parse('did:web:example.com:path/to?query=val');
    expect(url.method).toBe('web');
    expect(url.path).toMatch(/path/);
    expect(url.query).toBe('query=val');
  });

  it('parses a DID with fragment, query, and path', () => {
    const url = DIDUrl.parse('did:example:123/path?query=val#frag');
    expect(url.methodSpecificId).toBe('123');
    expect(url.path).toBe('path');
    expect(url.query).toBe('query=val');
    expect(url.fragment).toBe('frag');
  });

  it('parses a DID with ethr address and chain id', () => {
    const url = DIDUrl.parse('did:ethr:5:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(url.method).toBe('ethr');
    expect(url.methodSpecificId).toBe('5:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('toString returns the original DID URL', () => {
    const url = DIDUrl.parse('did:key:z6Mkq7P7P7P7#key-1');
    expect(url.toString()).toBe('did:key:z6Mkq7P7P7P7#key-1');
  });

  it('toString with all components', () => {
    const url = DIDUrl.parse('did:example:123/path?q=v#frag');
    expect(url.toString()).toBe('did:example:123/path?q=v#frag');
  });

  it('withFragment returns a new DIDUrl with the given fragment', () => {
    const url = DIDUrl.parse('did:key:z6Mkq');
    const withFrag = url.withFragment('key-1');
    expect(withFrag.fragment).toBe('key-1');
    expect(withFrag.methodSpecificId).toBe('z6Mkq');
  });

  it('withQuery returns a new DIDUrl with the given query', () => {
    const url = DIDUrl.parse('did:key:z6Mkq');
    const withQ = url.withQuery('service=hub');
    expect(withQ.query).toBe('service=hub');
  });

  it('withPath returns a new DIDUrl with the given path', () => {
    const url = DIDUrl.parse('did:key:z6Mkq');
    const withPath = url.withPath('some/path');
    expect(withPath.path).toBe('some/path');
  });

  it('equals returns true for identical DID URLs', () => {
    const a = DIDUrl.parse('did:key:z6Mkq#key-1');
    const b = DIDUrl.parse('did:key:z6Mkq#key-1');
    expect(a.equals(b)).toBe(true);
  });

  it('equals returns false for different DID URLs', () => {
    const a = DIDUrl.parse('did:key:z6Mkq#key-1');
    const b = DIDUrl.parse('did:key:z6Mkq#key-2');
    expect(a.equals(b)).toBe(false);
  });

  it('handles DID with only fragment and no path/query', () => {
    const url = DIDUrl.parse('did:key:z6Mkq#fragment-only');
    expect(url.fragment).toBe('fragment-only');
    expect(url.path).toBeUndefined();
    expect(url.query).toBeUndefined();
  });

  it('handles DID with empty path after colon', () => {
    const url = DIDUrl.parse('did:example:123/');
    expect(url.path).toBeUndefined();
  });
});
