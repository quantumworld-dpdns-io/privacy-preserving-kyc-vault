import { DIDMethod } from './methods.js';

export interface DIDUrl {
  did: string;
  method: DIDMethod;
  methodSpecificId: string;
  path?: string;
  query?: string;
  fragment?: string;
  toString(): string;
}

export interface ResolvedDID {
  didDocument: import('./document.js').DIDDocument;
  didResolutionMetadata: DIDResolutionMetadata;
  didDocumentMetadata: DIDDocumentMetadata;
}

export interface DIDResolutionMetadata {
  contentType?: string;
  error?: string;
  retryAfter?: number;
}

export interface DIDDocumentMetadata {
  created?: string;
  updated?: string;
  deactivated?: boolean;
  versionId?: string;
  nextUpdate?: string;
}

export interface DIDRegistrar {
  create(did: string, document: import('./document.js').DIDDocument): Promise<string>;
  update(did: string, document: import('./document.js').DIDDocument): Promise<void>;
  deactivate(did: string): Promise<void>;
}

export interface KeyDescription {
  id: string;
  type: string;
  controller: string;
  privateKey?: Uint8Array;
  publicKey: Uint8Array;
}

export enum KeyFormat {
  Multibase = 'multibase',
  JWK = 'jwk',
  Hex = 'hex',
  Base58 = 'base58',
}

export interface DIDDocumentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DIDKeyConfig {
  algorithm: string;
  curve?: string;
  keySize?: number;
}

export interface RegistryContractConfig {
  address: string;
  rpcUrl: string;
  chainId: number;
  abi?: Record<string, unknown>[];
}
