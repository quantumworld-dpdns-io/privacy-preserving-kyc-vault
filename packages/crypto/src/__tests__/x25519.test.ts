import { describe, it, expect } from 'vitest';
import {
  generateX25519KeyPair,
  deriveX25519SharedSecret,
  x25519PublicKeySize,
  x25519SecretKeySize,
  x25519SharedSecretSize,
} from '../x25519.js';

describe('X25519', () => {
  it('generates a key pair with correct sizes', async () => {
    const kp = await generateX25519KeyPair();
    expect(kp.publicKey).toHaveLength(32);
    expect(kp.secretKey).toHaveLength(32);
  });

  it('generates unique key pairs on each call', async () => {
    const [kp1, kp2] = await Promise.all([
      generateX25519KeyPair(),
      generateX25519KeyPair(),
    ]);
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.secretKey).not.toEqual(kp2.secretKey);
  });

  it('derives a shared secret of correct size', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();

    const shared = await deriveX25519SharedSecret(alice.secretKey, bob.publicKey);
    expect(shared).toHaveLength(32);
  });

  it('derives the same shared secret for both parties', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();

    const [sharedAlice, sharedBob] = await Promise.all([
      deriveX25519SharedSecret(alice.secretKey, bob.publicKey),
      deriveX25519SharedSecret(bob.secretKey, alice.publicKey),
    ]);

    expect(sharedAlice).toEqual(sharedBob);
  });

  it('derives different secrets for different key pairs', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();
    const charlie = await generateX25519KeyPair();

    const sharedAB = await deriveX25519SharedSecret(alice.secretKey, bob.publicKey);
    const sharedAC = await deriveX25519SharedSecret(alice.secretKey, charlie.publicKey);

    expect(sharedAB).not.toEqual(sharedAC);
  });

  it('derives consistent secret for same keys', async () => {
    const alice = await generateX25519KeyPair();
    const bob = await generateX25519KeyPair();

    const [s1, s2] = await Promise.all([
      deriveX25519SharedSecret(alice.secretKey, bob.publicKey),
      deriveX25519SharedSecret(alice.secretKey, bob.publicKey),
    ]);

    expect(s1).toEqual(s2);
  });

  it('x25519PublicKeySize returns 32', () => {
    expect(x25519PublicKeySize()).toBe(32);
  });

  it('x25519SecretKeySize returns 32', () => {
    expect(x25519SecretKeySize()).toBe(32);
  });

  it('x25519SharedSecretSize returns 32', () => {
    expect(x25519SharedSecretSize()).toBe(32);
  });

  it('public key bytes are not all zero', async () => {
    const kp = await generateX25519KeyPair();
    const allZero = new Uint8Array(32).every((b) => b === 0);
    expect(kp.publicKey).not.toEqual(new Uint8Array(32));
  });
});
