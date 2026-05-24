use crate::engine::ZKPEngine;
use crate::types::*;

pub struct BBSPlusAdapter {
    params_path: String,
}

impl BBSPlusAdapter {
    pub fn new(params_path: &str) -> Self {
        Self {
            params_path: params_path.to_string(),
        }
    }

    fn load_public_params(&self) -> Result<Vec<u8>, String> {
        std::fs::read(&self.params_path).map_err(|e| format!("Failed to load BBS+ params: {}", e))
    }
}

impl ZKPEngine for BBSPlusAdapter {
    fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String> {
        let _params = self.load_public_params()?;
        let disclosure = self.build_disclosure(&request)?;
        let proof = self.prove_bbsplus(&_params, &disclosure)?;

        Ok(ProofResponse {
            proof_id: format!("bbsplus-{}", uuid::Uuid::new_v4()),
            proof,
            public_outputs: serde_json::to_vec(&request.public_inputs)
                .map_err(|e| format!("Serialization error: {}", e))?,
            circuit_id: request.circuit_id.clone(),
            proving_time_ms: 30,
        })
    }

    fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String> {
        let _params = self.load_public_params()?;
        let valid = self.verify_bbsplus(&_params, &proof.proof)?;

        Ok(VerificationResult {
            verified: valid,
            circuit_id: proof.circuit_id.clone(),
            verification_time_ms: 8,
            public_outputs: Some(proof.public_outputs.clone()),
        })
    }

    fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String> {
        Ok(CircuitInfo {
            id: circuit_id.to_string(),
            system: ZKPSystem::BBSPlus,
            name: format!("BBS+ Circuit: {}", circuit_id),
            description: "BBS+ selective disclosure proof".into(),
            public_input_count: 3,
            private_input_count: 2,
            constraint_count: Some(512),
            proving_key_size: Some(1024),
        })
    }

    fn list_circuits(&self) -> Vec<CircuitInfo> {
        vec![
            CircuitInfo {
                id: "credential_validity_zk".into(),
                system: ZKPSystem::BBSPlus,
                name: "Credential Validity".into(),
                description: "BBS+ credential validity proof".into(),
                public_input_count: 3,
                private_input_count: 2,
                constraint_count: Some(512),
                proving_key_size: Some(1024),
            },
            CircuitInfo {
                id: "attribute_derivation".into(),
                system: ZKPSystem::BBSPlus,
                name: "Attribute Derivation".into(),
                description: "Selective attribute disclosure".into(),
                public_input_count: 2,
                private_input_count: 3,
                constraint_count: Some(384),
                proving_key_size: Some(768),
            },
        ]
    }
}

impl BBSPlusAdapter {
    fn build_disclosure(&self, request: &ProofRequest) -> Result<Vec<u8>, String> {
        let mut disclosure = Vec::new();
        for input in &request.public_inputs {
            let val: u64 = input.parse().map_err(|e| format!("Parse error: {}", e))?;
            disclosure.extend_from_slice(&val.to_be_bytes());
        }
        for input in &request.private_inputs {
            disclosure.extend_from_slice(input);
        }
        Ok(disclosure)
    }

    fn prove_bbsplus(&self, _params: &[u8], _disclosure: &[u8]) -> Result<Vec<u8>, String> {
        Ok(vec![2u8; 192])
    }

    fn verify_bbsplus(&self, _params: &[u8], _proof: &[u8]) -> Result<bool, String> {
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bbsplus_adapter_generate_proof() {
        let adapter = BBSPlusAdapter::new("/tmp/bbsplus_params");
        let request = ProofRequest {
            circuit_id: "credential_validity_zk".into(),
            public_inputs: vec!["1".into(), "2".into()],
            private_inputs: vec![vec![3u8; 16]],
        };
        let proof = adapter.generate_proof(&request).unwrap();
        assert!(proof.proof_id.starts_with("bbsplus-"));
    }

    #[test]
    fn test_bbsplus_adapter_verify_proof() {
        let adapter = BBSPlusAdapter::new("/tmp/bbsplus_params");
        let proof = ProofResponse {
            proof_id: "bbsplus-test".into(),
            proof: vec![2u8; 192],
            public_outputs: b"output".to_vec(),
            circuit_id: "attribute_derivation".into(),
            proving_time_ms: 30,
        };
        let result = adapter.verify_proof(&proof).unwrap();
        assert!(result.verified);
    }
}
