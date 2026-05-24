export type ProvingSystem = 'groth16' | 'plonk' | 'fflonk' | 'stark';

export interface CircuitConfig {
  id: string;
  name: string;
  provingSystem: ProvingSystem;
  circuitPath: string;
  provingKeyPath: string;
  verificationKeyPath: string;
  publicInputCount: number;
  privateInputCount: number;
  maxProofSize: number;
}

export interface ZKPEngineConfig {
  port: number;
  host: string;
  circuits: CircuitConfig[];
  defaultProvingSystem: ProvingSystem;
  maxProofGenerationTimeMs: number;
  maxVerificationTimeMs: number;
  wasmPath: string;
  useThreadPool: boolean;
  threadPoolSize: number;
}

export function loadConfig(): ZKPEngineConfig {
  const env = process.env;

  return {
    port: parseInt(env.ZKP_ENGINE_PORT || '3040', 10),
    host: env.ZKP_ENGINE_HOST || '0.0.0.0',
    circuits: [
      {
        id: 'age_verification',
        name: 'Age Verification',
        provingSystem: (env.AGE_CIRCUIT_PROVING_SYSTEM as ProvingSystem) || 'groth16',
        circuitPath: env.AGE_CIRCUIT_PATH || '/circuits/age_verification.circom',
        provingKeyPath: env.AGE_PROVING_KEY_PATH || '/circuits/keys/age_verification_pkey.bin',
        verificationKeyPath: env.AGE_VERIFICATION_KEY_PATH || '/circuits/keys/age_verification_vkey.json',
        publicInputCount: 1,
        privateInputCount: 2,
        maxProofSize: 1024,
      },
      {
        id: 'nationality_check',
        name: 'Nationality Check',
        provingSystem: (env.NATIONALITY_CIRCUIT_PROVING_SYSTEM as ProvingSystem) || 'groth16',
        circuitPath: env.NATIONALITY_CIRCUIT_PATH || '/circuits/nationality_check.circom',
        provingKeyPath: env.NATIONALITY_PROVING_KEY_PATH || '/circuits/keys/nationality_check_pkey.bin',
        verificationKeyPath: env.NATIONALITY_VERIFICATION_KEY_PATH || '/circuits/keys/nationality_check_vkey.json',
        publicInputCount: 2,
        privateInputCount: 3,
        maxProofSize: 1024,
      },
      {
        id: 'credential_ownership',
        name: 'Credential Ownership Proof',
        provingSystem: (env.OWNERSHIP_CIRCUIT_PROVING_SYSTEM as ProvingSystem) || 'groth16',
        circuitPath: env.OWNERSHIP_CIRCUIT_PATH || '/circuits/credential_ownership.circom',
        provingKeyPath: env.OWNERSHIP_PROVING_KEY_PATH || '/circuits/keys/credential_ownership_pkey.bin',
        verificationKeyPath: env.OWNERSHIP_VERIFICATION_KEY_PATH || '/circuits/keys/credential_ownership_vkey.json',
        publicInputCount: 2,
        privateInputCount: 4,
        maxProofSize: 2048,
      },
    ],
    defaultProvingSystem: (env.ZKP_DEFAULT_PROVING_SYSTEM as ProvingSystem) || 'groth16',
    maxProofGenerationTimeMs: parseInt(env.ZKP_MAX_PROOF_TIME_MS || '30000', 10),
    maxVerificationTimeMs: parseInt(env.ZKP_MAX_VERIFICATION_TIME_MS || '10000', 10),
    wasmPath: env.ZKP_WASM_PATH || '/circuits/wasm',
    useThreadPool: env.ZKP_USE_THREAD_POOL !== 'false',
    threadPoolSize: parseInt(env.ZKP_THREAD_POOL_SIZE || '4', 10),
  };
}
