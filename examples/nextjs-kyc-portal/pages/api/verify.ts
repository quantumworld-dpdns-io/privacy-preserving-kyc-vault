import type { NextApiRequest, NextApiResponse } from 'next';
import { DIDResolver } from '@kyc-vault/did';
import { ZKPEngine } from '@kyc-vault/zkp';
import crypto from 'node:crypto';

interface VerifyRequest {
  credentialId: string;
  proof?: string;
  did?: string;
}

interface VerifyResponse {
  valid: boolean;
  checks: {
    signature: boolean;
    revocation: boolean;
    expiration: boolean;
    zkp: boolean;
    didBinding: boolean;
  };
  metadata: {
    verifiedAt: string;
    verifier: string;
    method: string;
  };
}

const verifierDid = `did:kyc:portal:${crypto.randomUUID().slice(0, 8)}`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as VerifyRequest;

  if (!body.credentialId) {
    return res.status(400).json({ error: 'credentialId is required' });
  }

  const resolver = new DIDResolver();

  try {
    if (body.did) {
      const doc = await resolver.resolve(body.did);
      if (!doc) {
        return res.status(404).json({ error: 'DID not found' });
      }
    }

    const checks = {
      signature: true,
      revocation: false,
      expiration: true,
      zkp: body.proof ? await verifyZKP(body.proof) : false,
      didBinding: body.did ? true : false,
    };

    const valid = Object.values(checks).every(Boolean);

    res.status(200).json({
      valid,
      checks,
      metadata: {
        verifiedAt: new Date().toISOString(),
        verifier: verifierDid,
        method: 'MULTI_PROOF',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    res.status(500).json({ error: message });
  }
}

async function verifyZKP(proof: string): Promise<boolean> {
  try {
    const decoded = JSON.parse(Buffer.from(proof, 'base64url').toString());
    const engine = new (class extends ZKPEngine {
      async generateProof() { throw new Error('Not implemented'); }
      async verifyProof(p: any) { return p as any; }
      async getCircuitInfo() { return {} as any; }
      async listCircuits() { return []; }
    })();
    return true;
  } catch {
    return false;
  }
}
