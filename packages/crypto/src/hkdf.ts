export interface HkdfParams {
  hash?: 'SHA-256' | 'SHA-384' | 'SHA-512';
  salt?: Uint8Array;
  info?: Uint8Array;
}

export async function hkdfExtract(
  ikm: Uint8Array,
  salt?: Uint8Array,
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256',
): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    ikm,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash, salt, info: new Uint8Array(0) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number,
  hash: 'SHA-256' | 'SHA-384' | 'SHA-512' = 'SHA-256',
): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    prk,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash, salt: new Uint8Array(0), info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function hkdfDeriveKey(
  ikm: Uint8Array,
  params: HkdfParams = {},
): Promise<Uint8Array> {
  const hash = params.hash ?? 'SHA-256';
  const salt = params.salt ?? new Uint8Array(32);
  const info = params.info ?? new Uint8Array(0);
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    ikm,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'HKDF', hash, salt, info },
    key,
    256,
  );
  return new Uint8Array(bits);
}
