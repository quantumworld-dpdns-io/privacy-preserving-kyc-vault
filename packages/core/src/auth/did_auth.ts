import * as crypto from 'node:crypto';
import { DIDResolver } from '@kyc-vault/did';

export interface ChallengeRequest {
  did: string;
  domain?: string;
  expirationMs?: number;
}

export interface Challenge {
  challenge: string;
  did: string;
  domain?: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ChallengeVerification {
  verified: boolean;
  did?: string;
  error?: string;
}

const CHALLENGE_EXPIRATION_MS = 5 * 60 * 1000;

export function generateChallenge(req: ChallengeRequest): Challenge {
  const now = Date.now();
  const expiresAt = now + (req.expirationMs ?? CHALLENGE_EXPIRATION_MS);
  const nonce = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(`${req.did}:${nonce}:${expiresAt}`)
    .digest('hex');

  return {
    challenge,
    did: req.did,
    domain: req.domain,
    issuedAt: now,
    expiresAt,
  };
}

export function verifyChallengeSignature(
  challenge: Challenge,
  signature: string,
  publicKey: crypto.KeyLike,
): ChallengeVerification {
  if (Date.now() > challenge.expiresAt) {
    return { verified: false, error: 'Challenge expired' };
  }

  const verify = crypto.createVerify('sha256');
  verify.update(challenge.challenge);

  const isValid = verify.verify(publicKey, Buffer.from(signature, 'base64url'));

  return {
    verified: isValid,
    did: isValid ? challenge.did : undefined,
    error: isValid ? undefined : 'Invalid signature',
  };
}

export function verifyChallengeSignatureEd25519(
  challenge: Challenge,
  signature: string,
  publicKeyBytes: Uint8Array,
): ChallengeVerification {
  if (Date.now() > challenge.expiresAt) {
    return { verified: false, error: 'Challenge expired' };
  }

  const keyObject = crypto.createPublicKey({
    key: publicKeyBytes,
    format: 'der',
    type: 'spki',
  });

  return verifyChallengeSignature(challenge, signature, keyObject);
}

export async function authenticateWithDID(
  did: string,
  signature: string,
  resolver: DIDResolver,
  domain?: string,
): Promise<ChallengeVerification> {
  try {
    const doc = await resolver.resolve(did);
    const challenge = generateChallenge({ did, domain });
    const vm = doc.verificationMethod?.[0];
    if (!vm) {
      return { verified: false, error: 'No verification method found' };
    }
    const pkBytes = vm.publicKeyMultibase
      ? Buffer.from(vm.publicKeyMultibase.replace('z', ''), 'base64url')
      : null;
    if (!pkBytes) {
      return { verified: false, error: 'No public key available' };
    }
    return verifyChallengeSignatureEd25519(challenge, signature, pkBytes);
  } catch (err) {
    return { verified: false, error: (err as Error).message };
  }
}

export function createDIDAuthToken(did: string, challenge: string): string {
  return `${did}:${challenge}`;
}
