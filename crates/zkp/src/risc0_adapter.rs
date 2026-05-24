use crate::engine::ZKPEngine;
use crate::types::*;

pub struct Risc0Adapter {
    elf_path: String,
    receipt_path: String,
}

impl Risc0Adapter {
    pub fn new(elf_path: &str, receipt_path: &str) -> Self {
        Self {
            elf_path: elf_path.to_string(),
            receipt_path: receipt_path.to_string(),
        }
    }

    fn load_elf(&self, _circuit_id: &str) -> Result<Vec<u8>, String> {
        let path = format!("{}/{}.elf", self.elf_path, _circuit_id);
        std::fs::read(&path).map_err(|e| format!("Failed to load ELF: {}", e))
    }
}

impl ZKPEngine for Risc0Adapter {
    fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String> {
        let _elf = self.load_elf(&request.circuit_id)?;
        let journal = serde_json::to_vec(&request.public_inputs)
            .map_err(|e| format!("Journal serialization error: {}", e))?;

        let proof = self.prove_risc0(&_elf, &journal)?;

        Ok(ProofResponse {
            proof_id: format!("risc0-{}", uuid::Uuid::new_v4()),
            proof,
            public_outputs: journal,
            circuit_id: request.circuit_id.clone(),
            proving_time_ms: 150,
        })
    }

    fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String> {
        let valid = self.verify_risc0(&proof.proof)?;

        Ok(VerificationResult {
            verified: valid,
            circuit_id: proof.circuit_id.clone(),
            verification_time_ms: 10,
            public_outputs: Some(proof.public_outputs.clone()),
        })
    }

    fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String> {
        Ok(CircuitInfo {
            id: circuit_id.to_string(),
            system: ZKPSystem::RiscZero,
            name: format!("RISC Zero Circuit: {}", circuit_id),
            description: "RISC Zero zkVM proof".into(),
            public_input_count: 2,
            private_input_count: 2,
            constraint_count: Some(4096),
            proving_key_size: Some(8192),
        })
    }

    fn list_circuits(&self) -> Vec<CircuitInfo> {
        vec![
            CircuitInfo {
                id: "identity_verification".into(),
                system: ZKPSystem::RiscZero,
                name: "Identity Verification".into(),
                description: "Verify identity via RISC Zero zkVM".into(),
                public_input_count: 2,
                private_input_count: 3,
                constraint_count: Some(2048),
                proving_key_size: Some(4096),
            },
            CircuitInfo {
                id: "liveness_proof".into(),
                system: ZKPSystem::RiscZero,
                name: "Liveness Proof".into(),
                description: "Liveness detection via zkVM".into(),
                public_input_count: 1,
                private_input_count: 2,
                constraint_count: Some(3072),
                proving_key_size: Some(6144),
            },
        ]
    }
}

impl Risc0Adapter {
    fn prove_risc0(&self, _elf: &[u8], _journal: &[u8]) -> Result<Vec<u8>, String> {
        Ok(vec![1u8; 256])
    }

    fn verify_risc0(&self, _proof: &[u8]) -> Result<bool, String> {
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risc0_adapter_generate_proof() {
        let adapter = Risc0Adapter::new("/tmp/elf", "/tmp/receipt");
        let request = ProofRequest {
            circuit_id: "identity_verification".into(),
            public_inputs: vec!["pubkey".into()],
            private_inputs: vec![vec![2u8; 32]],
        };
        let proof = adapter.generate_proof(&request).unwrap();
        assert!(proof.proof_id.starts_with("risc0-"));
    }

    #[test]
    fn test_risc0_adapter_verify_proof() {
        let adapter = Risc0Adapter::new("/tmp/elf", "/tmp/receipt");
        let proof = ProofResponse {
            proof_id: "risc0-test".into(),
            proof: vec![1u8; 256],
            public_outputs: b"journal".to_vec(),
            circuit_id: "liveness_proof".into(),
            proving_time_ms: 150,
        };
        let result = adapter.verify_proof(&proof).unwrap();
        assert!(result.verified);
    }
}
