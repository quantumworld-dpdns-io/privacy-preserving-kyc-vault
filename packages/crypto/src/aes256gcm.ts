export interface Aes256GcmCiphertext {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

function extractTag(data: Uint8Array): { ciphertext: Uint8Array; tag: Uint8Array } {
  if (data.length < 16) throw new Error('Ciphertext too short for GCM tag');
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  return { ciphertext, tag };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
}

function getRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export async function encryptAes256Gcm(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv?: Uint8Array,
  aad?: Uint8Array,
): Promise<Aes256GcmCiphertext> {
  if (key.length !== 32) throw new Error('AES-256 key must be 32 bytes');
  const nonce = iv ?? getRandomBytes(12);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const encrypted = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 },
      cryptoKey,
      plaintext,
    ),
  );
  const { ciphertext, tag } = extractTag(encrypted);
  return { iv: nonce, ciphertext, tag };
}

export async function decryptAes256Gcm(
  ct: Aes256GcmCiphertext,
  key: Uint8Array,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  if (key.length !== 32) throw new Error('AES-256 key must be 32 bytes');
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  const input = concat(ct.ciphertext, ct.tag);
  return new Uint8Array(
    await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ct.iv, additionalData: aad, tagLength: 128 },
      cryptoKey,
      input,
    ),
  );
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = 600_000,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export function generateIv(): Uint8Array {
  return getRandomBytes(12);
}

export function generateSalt(): Uint8Array {
  return getRandomBytes(16);
}
