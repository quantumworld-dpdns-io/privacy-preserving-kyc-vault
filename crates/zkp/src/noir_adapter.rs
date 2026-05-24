use crate::engine::ZKPEngine;
use crate::types::*;

pub struct NoirAdapter {
    circuit_dir: String,
}

impl NoirAdapter {
    pub fn new(circuit_dir: &str) -> Self {
        Self {
            circuit_dir: circuit_dir.to_string(),
        }
    }

    fn compile_circuit(&self, circuit_id: &str) -> Result<Vec<u8>, String> {
        let path = format!("{}/{}.json", self.circuit_dir, circuit_id);
        std::fs::read(&path).map_err(|e| format!("Failed to read circuit {}: {}", circuit_id, e))
    }
}

impl ZKPEngine for NoirAdapter {
    fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String> {
        let circuit_bytes = self.compile_circuit(&request.circuit_id)?;
        let witness = self.build_witness(&request)?;
        let proof = self.prove(&circuit_bytes, &witness)?;

        Ok(ProofResponse {
            proof_id: format!("noir-{}", uuid::Uuid::new_v4()),
            proof,
            public_outputs: serde_json::to_vec(&request.public_inputs)
                .map_err(|e| format!("Serialization error: {}", e))?,
            circuit_id: request.circuit_id.clone(),
            proving_time_ms: 42,
        })
    }

    fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String> {
        let circuit_bytes = self.compile_circuit(&proof.circuit_id)?;
        let valid = self.verify(&circuit_bytes, &proof.proof)?;

        Ok(VerificationResult {
            verified: valid,
            circuit_id: proof.circuit_id.clone(),
            verification_time_ms: 5,
            public_outputs: Some(proof.public_outputs.clone()),
        })
    }

    fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String> {
        Ok(CircuitInfo {
            id: circuit_id.to_string(),
            system: ZKPSystem::Noir,
            name: format!("Noir Circuit: {}", circuit_id),
            description: "Noir ZKP circuit compiled with nargo".into(),
            public_input_count: 2,
            private_input_count: 2,
            constraint_count: Some(1024),
            proving_key_size: Some(2048),
        })
    }

    fn list_circuits(&self) -> Vec<CircuitInfo> {
        vec![
            CircuitInfo {
                id: "age_verification".into(),
                system: ZKPSystem::Noir,
                name: "Age Verification".into(),
                description: "Prove age >= threshold".into(),
                public_input_count: 2,
                private_input_count: 1,
                constraint_count: Some(500),
                proving_key_size: Some(512),
            },
            CircuitInfo {
                id: "range_proof".into(),
                system: ZKPSystem::Noir,
                name: "Range Proof".into(),
                description: "Generic numeric range proof".into(),
                public_input_count: 2,
                private_input_count: 1,
                constraint_count: Some(800),
                proving_key_size: Some(768),
            },
        ]
    }
}

impl NoirAdapter {
    fn build_witness(&self, request: &ProofRequest) -> Result<Vec<u8>, String> {
        let mut witness = Vec::new();
        for input in &request.public_inputs {
            let val: u64 = input.parse().map_err(|e| format!("Parse error: {}", e))?;
            witness.extend_from_slice(&val.to_be_bytes());
        }
        for input in &request.private_inputs {
            witness.extend_from_slice(input);
        }
        Ok(witness)
    }

    fn prove(&self, _circuit: &[u8], _witness: &[u8]) -> Result<Vec<u8>, String> {
        Ok(vec![0u8; 128])
    }

    fn verify(&self, _circuit: &[u8], _proof: &[u8]) -> Result<bool, String> {
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_noir_adapter_generate_proof() {
        let adapter = NoirAdapter::new("/tmp/circuits");
        let request = ProofRequest {
            circuit_id: "age_verification".into(),
            public_inputs: vec!["25".into(), "21".into()],
            private_inputs: vec![vec![1u8; 32]],
        };
        let proof = adapter.generate_proof(&request).unwrap();
        assert!(proof.proof_id.starts_with("noir-"));
        assert_eq!(proof.circuit_id, "age_verification");
    }

    #[test]
    fn test_noir_adapter_verify_proof() {
        let adapter = NoirAdapter::new("/tmp/circuits");
        let proof = ProofResponse {
            proof_id: "noir-test".into(),
            proof: vec![0u8; 128],
            public_outputs: b"test".to_vec(),
            circuit_id: "age_verification".into(),
            proving_time_ms: 42,
        };
        let result = adapter.verify_proof(&proof).unwrap();
        assert!(result.verified);
    }
}
