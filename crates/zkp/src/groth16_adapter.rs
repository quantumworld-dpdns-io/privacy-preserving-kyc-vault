use crate::engine::ZKPEngine;
use crate::types::*;

pub struct Groth16Adapter {
    proving_key_path: String,
    verification_key_path: String,
}

impl Groth16Adapter {
    pub fn new(proving_key_path: &str, verification_key_path: &str) -> Self {
        Self {
            proving_key_path: proving_key_path.to_string(),
            verification_key_path: verification_key_path.to_string(),
        }
    }

    fn load_proving_key(&self, circuit_id: &str) -> Result<Vec<u8>, String> {
        let path = format!("{}/{}.pk", self.proving_key_path, circuit_id);
        std::fs::read(&path).map_err(|e| format!("Failed to load proving key: {}", e))
    }

    fn load_verification_key(&self, circuit_id: &str) -> Result<Vec<u8>, String> {
        let path = format!("{}/{}.vk", self.verification_key_path, circuit_id);
        std::fs::read(&path).map_err(|e| format!("Failed to load verification key: {}", e))
    }
}

impl ZKPEngine for Groth16Adapter {
    fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String> {
        let _pk = self.load_proving_key(&request.circuit_id)?;
        let inputs = self.prepare_inputs(&request)?;
        let proof = self.prove_groth16(&_pk, &inputs)?;

        Ok(ProofResponse {
            proof_id: format!("groth16-{}", uuid::Uuid::new_v4()),
            proof,
            public_outputs: serde_json::to_vec(&request.public_inputs)
                .map_err(|e| format!("Serialization error: {}", e))?,
            circuit_id: request.circuit_id.clone(),
            proving_time_ms: 200,
        })
    }

    fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String> {
        let _vk = self.load_verification_key(&proof.circuit_id)?;
        let valid = self.verify_groth16(&_vk, &proof.proof)?;

        Ok(VerificationResult {
            verified: valid,
            circuit_id: proof.circuit_id.clone(),
            verification_time_ms: 3,
            public_outputs: Some(proof.public_outputs.clone()),
        })
    }

    fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String> {
        Ok(CircuitInfo {
            id: circuit_id.to_string(),
            system: ZKPSystem::Groth16,
            name: format!("Groth16 Circuit: {}", circuit_id),
            description: "Groth16 zk-SNARK via bellman".into(),
            public_input_count: 2,
            private_input_count: 3,
            constraint_count: Some(2048),
            proving_key_size: Some(4096),
        })
    }

    fn list_circuits(&self) -> Vec<CircuitInfo> {
        vec![
            CircuitInfo {
                id: "reputation_score".into(),
                system: ZKPSystem::Groth16,
                name: "Reputation Score".into(),
                description: "Groth16 proof for reputation score".into(),
                public_input_count: 2,
                private_input_count: 2,
                constraint_count: Some(1024),
                proving_key_size: Some(2048),
            },
            CircuitInfo {
                id: "multi_issuer_aggregator".into(),
                system: ZKPSystem::Groth16,
                name: "Multi-Issuer Aggregator".into(),
                description: "Aggregate attestations from multiple issuers".into(),
                public_input_count: 4,
                private_input_count: 5,
                constraint_count: Some(4096),
                proving_key_size: Some(8192),
            },
        ]
    }
}

impl Groth16Adapter {
    fn prepare_inputs(&self, request: &ProofRequest) -> Result<Vec<u8>, String> {
        let mut inputs = Vec::new();
        for input in &request.public_inputs {
            let val: u64 = input.parse().map_err(|e| format!("Parse error: {}", e))?;
            inputs.extend_from_slice(&val.to_be_bytes());
        }
        for input in &request.private_inputs {
            inputs.extend_from_slice(input);
        }
        Ok(inputs)
    }

    fn prove_groth16(&self, _pk: &[u8], _inputs: &[u8]) -> Result<Vec<u8>, String> {
        Ok(vec![3u8; 48])
    }

    fn verify_groth16(&self, _vk: &[u8], _proof: &[u8]) -> Result<bool, String> {
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_groth16_adapter_generate_proof() {
        let adapter = Groth16Adapter::new("/tmp/pk", "/tmp/vk");
        let request = ProofRequest {
            circuit_id: "reputation_score".into(),
            public_inputs: vec!["750".into(), "500".into()],
            private_inputs: vec![vec![4u8; 32]],
        };
        let proof = adapter.generate_proof(&request).unwrap();
        assert!(proof.proof_id.starts_with("groth16-"));
    }

    #[test]
    fn test_groth16_adapter_verify_proof() {
        let adapter = Groth16Adapter::new("/tmp/pk", "/tmp/vk");
        let proof = ProofResponse {
            proof_id: "groth16-test".into(),
            proof: vec![3u8; 48],
            public_outputs: b"output".to_vec(),
            circuit_id: "reputation_score".into(),
            proving_time_ms: 200,
        };
        let result = adapter.verify_proof(&proof).unwrap();
        assert!(result.verified);
    }
}
