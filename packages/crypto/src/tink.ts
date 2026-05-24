export type TinkAeadAlgorithm = 'AES-256-GCM' | 'AES-128-GCM' | 'AES-256-GCM-HKDF-SHA256';

export interface TinkKeyTemplate {
  algorithm: TinkAeadAlgorithm;
  keySize: number;
}

export interface TinkKeyset {
  primaryKeyId: number;
  keys: TinkKey[];
}

export interface TinkKey {
  keyId: number;
  keyData: Uint8Array;
  algorithm: TinkAeadAlgorithm;
  status: 'ENABLED' | 'DISABLED' | 'DESTROYED';
  outputPrefixType: 'TINK' | 'LEGACY' | 'RAW' | 'CRUNCHY';
}

const PREFIX_LENGTHS: Record<TinkKey['outputPrefixType'], number> = {
  TINK: 5,
  LEGACY: 5,
  RAW: 0,
  CRUNCHY: 5,
};

function getKeySize(algorithm: TinkAeadAlgorithm): number {
  switch (algorithm) {
    case 'AES-256-GCM':
    case 'AES-256-GCM-HKDF-SHA256':
      return 32;
    case 'AES-128-GCM':
      return 16;
  }
}

function getRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export function createTinkKeyTemplate(algorithm: TinkAeadAlgorithm = 'AES-256-GCM'): TinkKeyTemplate {
  return {
    algorithm,
    keySize: getKeySize(algorithm),
  };
}

export function generateTinkKeyset(template?: TinkKeyTemplate): TinkKeyset {
  const tmpl = template ?? createTinkKeyTemplate();
  const keyId = generateKeyId();
  return {
    primaryKeyId: keyId,
    keys: [
      {
        keyId,
        keyData: getRandomBytes(tmpl.keySize),
        algorithm: tmpl.algorithm,
        status: 'ENABLED',
        outputPrefixType: 'TINK',
      },
    ],
  };
}

function generateKeyId(): number {
  return (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) % 0xffffffff + 1;
}

function buildOutputPrefix(key: TinkKey): Uint8Array {
  const prefixLen = PREFIX_LENGTHS[key.outputPrefixType];
  if (prefixLen === 0) return new Uint8Array(0);

  const prefix = new Uint8Array(prefixLen);
  const view = new DataView(prefix.buffer);
  switch (key.outputPrefixType) {
    case 'TINK':
      view.setUint8(0, 0x01);
      break;
    case 'LEGACY':
    case 'CRUNCHY':
      view.setUint8(0, 0x00);
      break;
  }
  view.setUint32(1, key.keyId, false);
  return prefix;
}

export async function encryptTinkAead(
  plaintext: Uint8Array,
  aad: Uint8Array,
  keyset: TinkKeyset,
): Promise<Uint8Array> {
  const primaryKey = keyset.keys.find(k => k.keyId === keyset.primaryKeyId);
  if (!primaryKey) throw new Error('Primary key not found');
  if (primaryKey.status !== 'ENABLED') throw new Error('Primary key is not enabled');

  const iv = getRandomBytes(12);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    primaryKey.keyData,
    { name: 'AES-GCM', length: primaryKey.keyData.length * 8 },
    false,
    ['encrypt'],
  );

  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
      cryptoKey,
      plaintext,
    ),
  );

  const prefix = buildOutputPrefix(primaryKey);
  const result = new Uint8Array(prefix.length + iv.length + encrypted.length);
  result.set(prefix, 0);
  result.set(iv, prefix.length);
  result.set(encrypted, prefix.length + iv.length);
  return result;
}

export async function decryptTinkAead(
  ciphertext: Uint8Array,
  aad: Uint8Array,
  keyset: TinkKeyset,
): Promise<Uint8Array> {
  for (const key of keyset.keys) {
    if (key.status !== 'ENABLED') continue;
    const prefixLen = PREFIX_LENGTHS[key.outputPrefixType];
    const ivLen = 12;
    const tagLen = 16;
    const minLen = prefixLen + ivLen + tagLen;
    if (ciphertext.length < minLen) continue;

    if (prefixLen > 0) {
      const expectedPrefix = buildOutputPrefix(key);
      const actualPrefix = ciphertext.subarray(0, prefixLen);
      if (!constantTimeEqual(expectedPrefix, actualPrefix)) continue;
    }

    const iv = ciphertext.subarray(prefixLen, prefixLen + ivLen);
    const encrypted = ciphertext.subarray(prefixLen + ivLen);

    try {
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        key.keyData,
        { name: 'AES-GCM', length: key.keyData.length * 8 },
        false,
        ['decrypt'],
      );
      return new Uint8Array(
        await globalThis.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
          cryptoKey,
          encrypted,
        ),
      );
    } catch {
      continue;
    }
  }
  throw new Error('Decryption failed with all enabled keys');
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
