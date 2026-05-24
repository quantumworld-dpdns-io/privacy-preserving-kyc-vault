export interface X25519KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

const ALG = 'X25519' as EcKeyAlgorithm['name'];

export async function generateX25519KeyPair(): Promise<X25519KeyPair> {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: ALG },
    true,
    ['deriveBits', 'deriveKey'],
  );
  const [publicKey, secretKey] = await Promise.all([
    globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey),
    globalThis.crypto.subtle.exportKey('raw', keyPair.privateKey),
  ]);
  return {
    publicKey: new Uint8Array(publicKey),
    secretKey: new Uint8Array(secretKey),
  };
}

export async function deriveX25519SharedSecret(
  secretKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<Uint8Array> {
  const privateKey = await globalThis.crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: ALG },
    false,
    ['deriveBits'],
  );
  const pubKey = await globalThis.crypto.subtle.importKey(
    'raw',
    publicKey,
    { name: ALG },
    true,
    [],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: ALG, public: pubKey },
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}

export function x25519PublicKeySize(): number {
  return 32;
}

export function x25519SecretKeySize(): number {
  return 32;
}

export function x25519SharedSecretSize(): number {
  return 32;
}
