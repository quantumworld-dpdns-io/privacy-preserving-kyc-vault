export interface CircuitInfo {
  id: string;
  name: string;
  description: string;
  publicInputCount: number;
  privateInputCount: number;
}

export interface ProofRequest {
  circuitId: string;
  publicInputs: string[];
  privateInputs: Uint8Array[];
}

export interface ProofResponse {
  proofId: string;
  proof: Uint8Array;
  publicOutputs: Uint8Array;
  circuitId: string;
  provingTimeMs: number;
}

export interface VerificationResult {
  verified: boolean;
  circuitId: string;
  verificationTimeMs: number;
}

export abstract class ZKPEngine {
  abstract generateProof(request: ProofRequest): Promise<ProofResponse>;
  abstract verifyProof(proof: ProofResponse): Promise<VerificationResult>;
  abstract getCircuitInfo(circuitId: string): Promise<CircuitInfo>;
  abstract listCircuits(): Promise<CircuitInfo[]>;
}
