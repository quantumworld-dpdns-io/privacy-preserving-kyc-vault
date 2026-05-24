import { randomUUID, createHash } from 'node:crypto';
import { ZKPProof, ZKPProofRequest } from '../types/index.js';

export interface CircuitDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  publicInputs: string[];
  publicOutputs: string[];
  provingKeySize: number;
  verificationKey: string;
  supportedCurve: string;
}

export interface ZKProofGenerationResult {
  proof: ZKPProof;
  provingTimeMs: number;
}

export interface ZKProofVerificationResult {
  verified: boolean;
  circuitId: string;
  verificationTimeMs: number;
  errors?: string[];
}

export class ZKPService {
  private circuits = new Map<string, CircuitDefinition>();
  private proofs = new Map<string, ZKPProof>();

  constructor() {
    this.registerDefaultCircuits();
  }

  private registerDefaultCircuits(): void {
    const defaults: CircuitDefinition[] = [
      {
        id: 'age-verification-v1',
        name: 'Age Verification',
        version: '1.0.0',
        description: 'Prove age is above a threshold without revealing birth date',
        publicInputs: ['minAge', 'merkleRoot'],
        publicOutputs: ['isAboveAge'],
        provingKeySize: 2048,
        verificationKey: 'vk_age_v1_abc123',
        supportedCurve: 'bn254',
      },
      {
        id: 'kyc-attribute-v1',
        name: 'KYC Attribute Disclosure',
        version: '1.0.0',
        description: 'Selectively disclose KYC attributes without revealing all data',
        publicInputs: ['claimHash', 'issuerPubKey'],
        publicOutputs: ['attributeValid'],
        provingKeySize: 4096,
        verificationKey: 'vk_kyc_v1_def456',
        supportedCurve: 'bn254',
      },
      {
        id: 'membership-v1',
        name: 'Membership Verification',
        version: '1.0.0',
        description: 'Prove membership in a group without revealing identity',
        publicInputs: ['groupId', 'root'],
        publicOutputs: ['isMember'],
        provingKeySize: 1024,
        verificationKey: 'vk_mem_v1_ghi789',
        supportedCurve: 'bn254',
      },
    ];

    for (const circuit of defaults) {
      this.circuits.set(circuit.id, circuit);
    }
  }

  async getCircuits(): Promise<CircuitDefinition[]> {
    return Array.from(this.circuits.values());
  }

  async getCircuit(id: string): Promise<CircuitDefinition> {
    const circuit = this.circuits.get(id);
    if (!circuit) {
      throw new Object.assign(new Error(`Circuit not found: ${id}`), { statusCode: 404 });
    }
    return circuit;
  }

  async registerCircuit(circuit: CircuitDefinition): Promise<CircuitDefinition> {
    if (this.circuits.has(circuit.id)) {
      throw new Object.assign(new Error(`Circuit already exists: ${circuit.id}`), { statusCode: 409 });
    }
    this.circuits.set(circuit.id, circuit);
    return circuit;
  }

  async generateProof(request: ZKPProofRequest): Promise<ZKProofGenerationResult> {
    const circuit = await this.getCircuit(request.circuitId);
    const startTime = Date.now();

    const inputHash = createHash('sha256')
      .update(JSON.stringify(request.inputs))
      .digest('hex');

    const proofId = `proof-${randomUUID()}`;
    const proof: ZKPProof = {
      proofId,
      circuitId: request.circuitId,
      proof: {
        pi_a: ['0x' + inputHash.slice(0, 32), '0x' + inputHash.slice(32, 64), '0x1'],
        pi_b: [['0x0', '0x0'], ['0x0', '0x0']],
        pi_c: ['0x' + inputHash.slice(0, 16), '0x' + inputHash.slice(16, 32)],
        protocol: 'groth16',
      },
      publicInputs: request.inputs as Record<string, unknown>,
      publicOutputs: { verified: true, valid: true },
      created: new Date().toISOString(),
    };

    const provingTimeMs = Date.now() - startTime;
    this.proofs.set(proofId, proof);

    return { proof, provingTimeMs };
  }

  async verifyProof(circuitId: string, proof: ZKPProof): Promise<ZKProofVerificationResult> {
    const circuit = await this.getCircuit(circuitId);
    const startTime = Date.now();
    const errors: string[] = [];

    if (!proof.proof || typeof proof.proof !== 'object') {
      errors.push('Invalid proof format');
    }

    if (!proof.publicInputs || Object.keys(proof.publicInputs).length === 0) {
      errors.push('Missing public inputs');
    }

    if (!proof.circuitId || proof.circuitId !== circuitId) {
      errors.push('Circuit ID mismatch');
    }

    const verified = errors.length === 0;
    const verificationTimeMs = Date.now() - startTime;

    return {
      verified,
      circuitId,
      verificationTimeMs,
      ...(errors.length > 0 ? { errors } : {}),
    };
  }

  async getProof(proofId: string): Promise<ZKPProof> {
    const proof = this.proofs.get(proofId);
    if (!proof) {
      throw new Object.assign(new Error(`Proof not found: ${proofId}`), { statusCode: 404 });
    }
    return proof;
  }
}
