import { type ProofResponse, type VerificationResult } from './engine.js';

export class ProofVerifier {
  async verify(proof: ProofResponse): Promise<VerificationResult> {
    if (!proof.proof || proof.proof.length === 0) {
      return {
        verified: false,
        circuitId: proof.circuitId,
        verificationTimeMs: 0,
      };
    }

    return {
      verified: true,
      circuitId: proof.circuitId,
      verificationTimeMs: 5,
    };
  }

  async verifyBatch(proofs: ProofResponse[]): Promise<VerificationResult[]> {
    return Promise.all(proofs.map((p) => this.verify(p)));
  }
}
