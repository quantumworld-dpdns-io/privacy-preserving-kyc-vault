import { ProofVerifier } from '@kyc-vault/zkp';
import { loadConfig } from './config.js';

const config = loadConfig();

export interface VerifyRequest {
  circuitId: string;
  proof: string;
  publicInputs: string[];
}

export interface VerifyResponse {
  verified: boolean;
  circuitId: string;
  verificationTimeMs: number;
  errors: string[];
}

export class VerifierService {
  private verifier: ProofVerifier;

  constructor() {
    this.verifier = new ProofVerifier();
  }

  async verifyProof(request: VerifyRequest): Promise<VerifyResponse> {
    const circuit = config.circuits.find((c) => c.id === request.circuitId);
    if (!circuit) {
      return {
        verified: false,
        circuitId: request.circuitId,
        verificationTimeMs: 0,
        errors: [`Unknown circuit: ${request.circuitId}`],
      };
    }

    if (!request.proof || request.proof.length === 0) {
      return {
        verified: false,
        circuitId: request.circuitId,
        verificationTimeMs: 0,
        errors: ['Empty proof provided'],
      };
    }

    if (request.publicInputs.length !== circuit.publicInputCount) {
      return {
        verified: false,
        circuitId: request.circuitId,
        verificationTimeMs: 0,
        errors: [
          `Expected ${circuit.publicInputCount} public inputs, got ${request.publicInputs.length}`,
        ],
      };
    }

    const start = performance.now();

    const proofBytes = Buffer.from(request.proof, 'hex');
    const result = await this.verifier.verify({
      proofId: `verify-${request.circuitId}-${Date.now()}`,
      proof: proofBytes,
      publicOutputs: new Uint8Array(32),
      circuitId: request.circuitId,
      provingTimeMs: 0,
    });

    const verificationTimeMs = Math.round(performance.now() - start);

    return {
      verified: result.verified,
      circuitId: request.circuitId,
      verificationTimeMs,
      errors: result.verified ? [] : ['Proof verification failed'],
    };
  }

  async verifyBatch(requests: VerifyRequest[]): Promise<VerifyResponse[]> {
    return Promise.all(requests.map((r) => this.verifyProof(r)));
  }
}

export const verifier = new VerifierService();
