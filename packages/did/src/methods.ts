import { DIDError, DIDErrorCode } from './error.js';

export enum DIDMethod {
  Key = 'key',
  Web = 'web',
  Ethr = 'ethr',
}

export function parseDID(did: string): { method: DIDMethod; methodSpecificId: string } {
  const parts = did.split(':');
  if (parts.length < 3 || parts[0] !== 'did') {
    throw new DIDError(
      `DID must start with 'did:', got ${did}`,
      DIDErrorCode.InvalidDID,
    );
  }
  const method = parts[1] as DIDMethod;
  const methodSpecificId = parts.slice(2).join(':');
  return { method, methodSpecificId };
}
