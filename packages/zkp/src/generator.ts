import { ZKPEngine, type ProofRequest, type ProofResponse, type CircuitInfo } from './engine.js';

export class ProofGenerator {
  constructor(private engine: ZKPEngine) {}

  async generateAgeProof(age: number, minAge: number): Promise<ProofResponse> {
    return this.engine.generateProof({
      circuitId: 'age_verification',
      publicInputs: [age.toString(), minAge.toString()],
      privateInputs: [new Uint8Array(32)],
    });
  }

  async generateRangeProof(value: number, min: number, max: number): Promise<ProofResponse> {
    return this.engine.generateProof({
      circuitId: 'range_proof',
      publicInputs: [min.toString(), max.toString()],
      privateInputs: [new Uint8Array([value])],
    });
  }

  async generateNationalityProof(
    nationality: string,
    allowed: string[],
  ): Promise<ProofResponse> {
    return this.engine.generateProof({
      circuitId: 'nationality_check',
      publicInputs: allowed,
      privateInputs: [new TextEncoder().encode(nationality)],
    });
  }
}
