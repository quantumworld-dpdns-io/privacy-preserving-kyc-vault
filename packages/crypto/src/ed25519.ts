export interface Ed25519KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface Ed25519Signature {
  signature: Uint8Array;
}

const ALG = 'Ed25519' as EcKeyAlgorithm['name'];

export async function generateEd25519KeyPair(): Promise<Ed25519KeyPair> {
  const keyPair = await globalThis.crypto.subtle.generateKey(
    { name: ALG },
    true,
    ['sign', 'verify'],
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

export async function signEd25519(
  secretKey: Uint8Array,
  message: Uint8Array,
): Promise<Ed25519Signature> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: ALG },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await globalThis.crypto.subtle.sign({ name: ALG }, key, message),
  );
  return { signature };
}

export async function verifyEd25519(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    publicKey,
    { name: ALG },
    false,
    ['verify'],
  );
  return globalThis.crypto.subtle.verify({ name: ALG }, key, signature, message);
}

export function ed25519PublicKeySize(): number {
  return 32;
}

export function ed25519SecretKeySize(): number {
  return 32;
}

export function ed25519SignatureSize(): number {
  return 64;
}
