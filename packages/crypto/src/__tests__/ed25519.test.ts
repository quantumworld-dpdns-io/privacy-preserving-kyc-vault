import { describe, it, expect } from 'vitest';
import {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  ed25519PublicKeySize,
  ed25519SecretKeySize,
  ed25519SignatureSize,
} from '../ed25519.js';

describe('Ed25519', () => {
  it('generates a key pair with correct sizes', async () => {
    const kp = await generateEd25519KeyPair();
    expect(kp.publicKey).toHaveLength(32);
    expect(kp.secretKey).toHaveLength(32);
  });

  it('generates unique key pairs', async () => {
    const [kp1, kp2] = await Promise.all([
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
    ]);
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.secretKey).not.toEqual(kp2.secretKey);
  });

  it('signs a message and verifies successfully', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const { signature } = await signEd25519(kp.secretKey, message);

    expect(signature).toHaveLength(64);

    const isValid = await verifyEd25519(kp.publicKey, message, signature);
    expect(isValid).toBe(true);
  });

  it('rejects a signature on a tampered message', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new Uint8Array([1, 2, 3, 4, 5]);
    const { signature } = await signEd25519(kp.secretKey, message);

    const tampered = new Uint8Array([1, 2, 3, 4, 0]);
    const isValid = await verifyEd25519(kp.publicKey, tampered, signature);
    expect(isValid).toBe(false);
  });

  it('rejects a signature from a different key', async () => {
    const [alice, bob] = await Promise.all([
      generateEd25519KeyPair(),
      generateEd25519KeyPair(),
    ]);

    const message = new Uint8Array([1, 2, 3]);
    const { signature } = await signEd25519(alice.secretKey, message);

    const isValid = await verifyEd25519(bob.publicKey, message, signature);
    expect(isValid).toBe(false);
  });

  it('signs and verifies an empty message', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new Uint8Array(0);
    const { signature } = await signEd25519(kp.secretKey, message);

    const isValid = await verifyEd25519(kp.publicKey, message, signature);
    expect(isValid).toBe(true);
  });

  it('signs and verifies a large message', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new Uint8Array(65536).fill(0xAB);
    const { signature } = await signEd25519(kp.secretKey, message);

    const isValid = await verifyEd25519(kp.publicKey, message, signature);
    expect(isValid).toBe(true);
  });

  it('rejects a tampered signature', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new Uint8Array([1, 2, 3]);
    const { signature } = await signEd25519(kp.secretKey, message);
    const tamperedSig = new Uint8Array(signature);
    tamperedSig[0] ^= 0xFF;

    const isValid = await verifyEd25519(kp.publicKey, message, tamperedSig);
    expect(isValid).toBe(false);
  });

  it('signs the same message consistently (deterministic)', async () => {
    const kp = await generateEd25519KeyPair();
    const message = new Uint8Array([1, 2, 3]);

    const { signature: sig1 } = await signEd25519(kp.secretKey, message);
    const { signature: sig2 } = await signEd25519(kp.secretKey, message);

    expect(sig1).toEqual(sig2);
  });

  it('ed25519PublicKeySize returns 32', () => {
    expect(ed25519PublicKeySize()).toBe(32);
  });

  it('ed25519SecretKeySize returns 32', () => {
    expect(ed25519SecretKeySize()).toBe(32);
  });

  it('ed25519SignatureSize returns 64', () => {
    expect(ed25519SignatureSize()).toBe(64);
  });
});
