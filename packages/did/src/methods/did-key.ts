import { DIDError, DIDErrorCode } from '../error.js';
import { DIDDocument } from '../document.js';
import { VerificationMethod } from '../verification.js';
import type { ResolverMethod } from '../resolver.js';
import { KeyFormat } from '../types.js';

const MULTIBASE_PREFIXES: Record<string, { type: string; algorithm: string; keySize: number }> = {
  z: { type: 'Ed25519VerificationKey2020', algorithm: 'Ed25519', keySize: 32 },
};

function decodeMultibase(encoded: string): { bytes: Uint8Array; prefix: string } {
  const prefix = encoded[0];
  if (!MULTIBASE_PREFIXES[prefix]) {
    throw new DIDError(
      `Unsupported multibase prefix: ${prefix}`,
      DIDErrorCode.CryptoError,
    );
  }

  let raw: string;
  let bytes: Uint8Array;

  switch (prefix) {
    case 'z': {
      raw = encoded.slice(1);
      const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
      let bits = 0;
      let bitLength = 0;
      const output: number[] = [];
      for (const ch of raw) {
        const idx = alphabet.indexOf(ch);
        if (idx === -1) {
          throw new DIDError(`Invalid base32 character: ${ch}`, DIDErrorCode.CryptoError);
        }
        bits = (bits << 5) | idx;
        bitLength += 5;
        if (bitLength >= 8) {
          output.push((bits >> (bitLength - 8)) & 0xff);
          bitLength -= 8;
        }
      }
      bytes = new Uint8Array(output);
      break;
    }
    default:
      bytes = new Uint8Array(0);
  }

  return { bytes, prefix };
}

export function resolveDIDKey(methodSpecificId: string): Promise<DIDDocument> {
  const did = `did:key:${methodSpecificId}`;
  const doc = new DIDDocument(did);
  const vmId = `${did}#${methodSpecificId}`;

  let keyType = 'Ed25519VerificationKey2020';

  try {
    const { bytes, prefix } = decodeMultibase(methodSpecificId);
    const config = MULTIBASE_PREFIXES[prefix];
    if (config) {
      keyType = config.type;
    }
    const vm = VerificationMethod.fromEd25519(vmId, did, bytes);
    doc.addVerificationMethod(vm);
  } catch {
    doc.addVerificationMethod({
      id: vmId,
      type: keyType,
      controller: did,
      publicKeyMultibase: methodSpecificId,
    } as any);
  }

  doc.created = new Date().toISOString();

  return Promise.resolve(doc);
}
