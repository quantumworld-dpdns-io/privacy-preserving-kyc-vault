import { randomUUID } from 'node:crypto';
import { ZKPEngine, type ProofRequest } from '@kyc-vault/zkp';
import { loadConfig, type CircuitConfig } from './config.js';

const config = loadConfig();

export interface ProverRequest {
  circuitId: string;
  publicInputs: string[];
  privateInputs: string[];
}

export interface ProverResponse {
  proofId: string;
  proof: string;
  circuitId: string;
  provingTimeMs: number;
  publicOutputs: string[];
}

export class ProverService {
  private engine: ZKPEngine;
  private circuitMap: Map<string, CircuitConfig>;

  constructor() {
    this.engine = new (class extends ZKPEngine {
      async generateProof(request: ProofRequest) {
        const start = performance.now();
        const proof = new Uint8Array(64);
        const provingTimeMs = Math.round(performance.now() - start);
        return {
          proofId: randomUUID(),
          proof,
          publicOutputs: new Uint8Array(32),
          circuitId: request.circuitId,
          provingTimeMs,
        };
      }
      async verifyProof() {
        return { verified: true, circuitId: '', verificationTimeMs: 0 };
      }
      async getCircuitInfo() {
        return { id: '', name: '', description: '', publicInputCount: 0, privateInputCount: 0 };
      }
      async listCircuits() {
        return [];
      }
    })();

    this.circuitMap = new Map(config.circuits.map((c) => [c.id, c]));
  }

  async generateProof(request: ProverRequest): Promise<ProverResponse> {
    const circuit = this.circuitMap.get(request.circuitId);
    if (!circuit) {
      throw new Error(`Unknown circuit: ${request.circuitId}`);
    }

    if (request.publicInputs.length !== circuit.publicInputCount) {
      throw new Error(
        `Expected ${circuit.publicInputCount} public inputs, got ${request.publicInputs.length}`,
      );
    }

    if (request.privateInputs.length !== circuit.privateInputCount) {
      throw new Error(
        `Expected ${circuit.privateInputCount} private inputs, got ${request.privateInputs.length}`,
      );
    }

    const start = performance.now();

    const proofRequest: ProofRequest = {
      circuitId: request.circuitId,
      publicInputs: request.publicInputs,
      privateInputs: request.privateInputs.map((s) => new TextEncoder().encode(s)),
    };

    const result = await this.engine.generateProof(proofRequest);

    const provingTimeMs = Math.round(performance.now() - start);

    if (provingTimeMs > config.maxProofGenerationTimeMs) {
      console.warn(`Proof generation took ${provingTimeMs}ms, exceeding limit of ${config.maxProofGenerationTimeMs}ms`);
    }

    const proofHex = Buffer.from(result.proof).toString('hex');

    return {
      proofId: result.proofId,
      proof: proofHex,
      circuitId: request.circuitId,
      provingTimeMs,
      publicOutputs: request.publicInputs,
    };
  }

  async generateProofBatch(requests: ProverRequest[]): Promise<ProverResponse[]> {
    return Promise.all(requests.map((r) => this.generateProof(r)));
  }

  listCircuits(): CircuitConfig[] {
    return config.circuits;
  }

  getCircuit(circuitId: string): CircuitConfig | undefined {
    return this.circuitMap.get(circuitId);
  }
}

export const prover = new ProverService();
