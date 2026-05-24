import { describe, it, expect, vi } from 'vitest';
import { ProofGenerator } from '../generator.js';
import { ZKPEngine, type ProofResponse } from '../engine.js';

class MockEngine extends ZKPEngine {
  async generateProof(): Promise<ProofResponse> {
    return {
      proofId: 'proof-mock-123',
      proof: new Uint8Array(64),
      publicOutputs: new Uint8Array(32),
      circuitId: 'age_verification',
      provingTimeMs: 42,
    };
  }

  async verifyProof(): Promise<{ verified: boolean; circuitId: string; verificationTimeMs: number }> {
    return { verified: true, circuitId: 'age_verification', verificationTimeMs: 5 };
  }

  async getCircuitInfo(): Promise<{ id: string; name: string; description: string; publicInputCount: number; privateInputCount: number }> {
    return { id: 'age_verification', name: 'Age Verification', description: '', publicInputCount: 2, privateInputCount: 1 };
  }

  async listCircuits(): Promise<{ id: string; name: string; description: string; publicInputCount: number; privateInputCount: number }[]> {
    return [];
  }
}

describe('ProofGenerator', () => {
  it('generateAgeProof returns a valid proof', async () => {
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);
    const proof = await gen.generateAgeProof(25, 21);

    expect(proof.circuitId).toBe('age_verification');
    expect(proof.proofId).toBe('proof-mock-123');
    expect(proof.proof.length).toBe(64);
    expect(proof.provingTimeMs).toBeGreaterThan(0);
  });

  it('generateAgeProof passes correct circuit id', async () => {
    const spy = vi.spyOn(MockEngine.prototype, 'generateProof');
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);

    await gen.generateAgeProof(30, 18);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ circuitId: 'age_verification' }),
    );
  });

  it('generateRangeProof returns a valid proof', async () => {
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);
    const proof = await gen.generateRangeProof(500, 0, 1000);

    expect(proof.circuitId).toBe('range_proof');
    expect(proof.proofId).toBeDefined();
    expect(proof.proof.length).toBeGreaterThan(0);
  });

  it('generateRangeProof passes min and max as public inputs', async () => {
    const spy = vi.spyOn(MockEngine.prototype, 'generateProof');
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);

    await gen.generateRangeProof(750, 100, 1000);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        circuitId: 'range_proof',
        publicInputs: ['100', '1000'],
      }),
    );
  });

  it('generateNationalityProof returns a valid proof', async () => {
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);
    const proof = await gen.generateNationalityProof('US', ['US', 'CA', 'UK']);

    expect(proof.circuitId).toBe('nationality_check');
    expect(proof.proof.length).toBeGreaterThan(0);
  });

  it('generateNationalityProof passes allowed countries as public inputs', async () => {
    const spy = vi.spyOn(MockEngine.prototype, 'generateProof');
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);

    const allowed = ['US', 'CA'];
    await gen.generateNationalityProof('US', allowed);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        circuitId: 'nationality_check',
        publicInputs: allowed,
      }),
    );
  });

  it('generates proof with age exactly at minimum', async () => {
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);
    const proof = await gen.generateAgeProof(18, 18);

    expect(proof.proofId).toBeDefined();
    expect(proof.provingTimeMs).toBeGreaterThan(0);
  });

  it('generates proof with large range values', async () => {
    const engine = new MockEngine();
    const gen = new ProofGenerator(engine);
    const proof = await gen.generateRangeProof(1000000, 0, 2000000);

    expect(proof.circuitId).toBe('range_proof');
    expect(proof.provingTimeMs).toBeGreaterThan(0);
  });
});
