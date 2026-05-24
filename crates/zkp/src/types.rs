use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRequest {
    pub circuit_id: String,
    pub public_inputs: Vec<String>,
    pub private_inputs: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofResponse {
    pub proof_id: String,
    pub proof: Vec<u8>,
    pub public_outputs: Vec<u8>,
    pub circuit_id: String,
    pub proving_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    pub verified: bool,
    pub circuit_id: String,
    pub verification_time_ms: u64,
    pub public_outputs: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ZKPSystem {
    Noir,
    RiscZero,
    BBSPlus,
    Groth16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitInfo {
    pub id: String,
    pub system: ZKPSystem,
    pub name: String,
    pub description: String,
    pub public_input_count: u32,
    pub private_input_count: u32,
    pub constraint_count: Option<u64>,
    pub proving_key_size: Option<u64>,
}
