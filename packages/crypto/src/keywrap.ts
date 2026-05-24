export interface AesKeyWrapCiphertext {
  wrappedKey: Uint8Array;
}

export async function aesKeyWrap(
  plaintextKey: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<AesKeyWrapCiphertext> {
  if (wrappingKey.length !== 16 && wrappingKey.length !== 24 && wrappingKey.length !== 32) {
    throw new Error('Wrapping key must be 16, 24, or 32 bytes (AES-128/192/256)');
  }
  if (plaintextKey.length % 8 !== 0) {
    throw new Error('Plaintext key length must be a multiple of 8 bytes');
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    wrappingKey,
    { name: 'AES-KW', length: wrappingKey.length * 8 },
    false,
    ['wrapKey'],
  );
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    plaintextKey,
    'AES-GCM',
    true,
    ['encrypt'],
  );
  const wrapped = await globalThis.crypto.subtle.wrapKey('raw', cryptoKey, key, { name: 'AES-KW' });
  return { wrappedKey: new Uint8Array(wrapped) };
}

export async function aesKeyUnwrap(
  wrappedKey: Uint8Array,
  wrappingKey: Uint8Array,
): Promise<Uint8Array> {
  if (wrappingKey.length !== 16 && wrappingKey.length !== 24 && wrappingKey.length !== 32) {
    throw new Error('Wrapping key must be 16, 24, or 32 bytes (AES-128/192/256)');
  }
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    wrappingKey,
    { name: 'AES-KW', length: wrappingKey.length * 8 },
    false,
    ['unwrapKey'],
  );
  const unwrapped = await globalThis.crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    key,
    { name: 'AES-KW' },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const raw = await globalThis.crypto.subtle.exportKey('raw', unwrapped);
  return new Uint8Array(raw);
}
