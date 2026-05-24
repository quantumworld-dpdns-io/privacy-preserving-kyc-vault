import { describe, it, expect } from 'vitest';
import { ProofVerifier } from '../verifier.js';
import type { ProofResponse } from '../engine.js';

function makeProof(overrides: Partial<ProofResponse> = {}): ProofResponse {
  return {
    proofId: 'proof-1',
    proof: new Uint8Array([1, 2, 3, 4]),
    publicOutputs: new Uint8Array(0),
    circuitId: 'age_verification',
    provingTimeMs: 10,
    ...overrides,
  };
}

describe('ProofVerifier', () => {
  it('verifies a valid proof successfully', async () => {
    const verifier = new ProofVerifier();
    const result = await verifier.verify(makeProof());

    expect(result.verified).toBe(true);
    expect(result.circuitId).toBe('age_verification');
    expect(result.verificationTimeMs).toBeGreaterThan(0);
  });

  it('rejects a proof with empty proof bytes', async () => {
    const verifier = new ProofVerifier();
    const result = await verifier.verify(makeProof({ proof: new Uint8Array(0) }));

    expect(result.verified).toBe(false);
  });

  it('verifies with different circuit ids', async () => {
    const verifier = new ProofVerifier();
    const result = await verifier.verify(makeProof({ circuitId: 'range_proof' }));

    expect(result.verified).toBe(true);
    expect(result.circuitId).toBe('range_proof');
  });

  it('batch verifies multiple valid proofs', async () => {
    const verifier = new ProofVerifier();
    const proofs = [
      makeProof({ proofId: 'p1' }),
      makeProof({ proofId: 'p2' }),
      makeProof({ proofId: 'p3' }),
    ];

    const results = await verifier.verifyBatch(proofs);
    expect(results).toHaveLength(3);
    results.forEach((r) => expect(r.verified).toBe(true));
  });

  it('batch verifies mixed valid and invalid proofs', async () => {
    const verifier = new ProofVerifier();
    const proofs = [
      makeProof({ proofId: 'p1' }),
      makeProof({ proofId: 'p2', proof: new Uint8Array(0) }),
      makeProof({ proofId: 'p3' }),
    ];

    const results = await verifier.verifyBatch(proofs);
    expect(results[0].verified).toBe(true);
    expect(results[1].verified).toBe(false);
    expect(results[2].verified).toBe(true);
  });

  it('batch verifies empty array', async () => {
    const verifier = new ProofVerifier();
    const results = await verifier.verifyBatch([]);

    expect(results).toEqual([]);
  });

  it('batch verifies all invalid proofs', async () => {
    const verifier = new ProofVerifier();
    const proofs = [
      makeProof({ proof: new Uint8Array(0) }),
      makeProof({ proof: new Uint8Array(0) }),
    ];

    const results = await verifier.verifyBatch(proofs);
    results.forEach((r) => expect(r.verified).toBe(false));
  });

  it('returns verification time for valid proofs', async () => {
    const verifier = new ProofVerifier();
    const result = await verifier.verify(makeProof());

    expect(result.verificationTimeMs).toBeGreaterThan(0);
    expect(typeof result.verificationTimeMs).toBe('number');
  });
});
