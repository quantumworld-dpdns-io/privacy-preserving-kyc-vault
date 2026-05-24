use crate::types::*;
use std::collections::HashMap;

pub trait ZKPEngine: Send + Sync {
    fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String>;
    fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String>;
    fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String>;
    fn list_circuits(&self) -> Vec<CircuitInfo>;
}

pub struct ZKPEngineRegistry {
    engines: HashMap<String, Box<dyn ZKPEngine>>,
}

impl ZKPEngineRegistry {
    pub fn new() -> Self {
        Self {
            engines: HashMap::new(),
        }
    }

    pub fn register(&mut self, name: &str, engine: Box<dyn ZKPEngine>) {
        self.engines.insert(name.to_string(), engine);
    }

    pub fn get(&self, name: &str) -> Option<&Box<dyn ZKPEngine>> {
        self.engines.get(name)
    }
}

pub struct MockZKPEngine;

impl ZKPEngine for MockZKPEngine {
    fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String> {
        Ok(ProofResponse {
            proof_id: format!("proof-{}", uuid::Uuid::new_v4()),
            proof: vec![0u8; 64],
            public_outputs: serde_json::to_vec(&request.public_inputs).unwrap(),
            circuit_id: request.circuit_id.clone(),
            proving_time_ms: 42,
        })
    }

    fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String> {
        Ok(VerificationResult {
            verified: true,
            circuit_id: proof.circuit_id.clone(),
            verification_time_ms: 5,
            public_outputs: Some(proof.public_outputs.clone()),
        })
    }

    fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String> {
        Ok(CircuitInfo {
            id: circuit_id.to_string(),
            system: ZKPSystem::Noir,
            name: format!("Circuit: {}", circuit_id),
            description: "Mock circuit for testing".into(),
            public_input_count: 2,
            private_input_count: 1,
            constraint_count: Some(1000),
            proving_key_size: Some(1024),
        })
    }

    fn list_circuits(&self) -> Vec<CircuitInfo> {
        vec![
            CircuitInfo {
                id: "age_verification".into(),
                system: ZKPSystem::Noir,
                name: "Age Verification".into(),
                description: "Prove age >= threshold without revealing DOB".into(),
                public_input_count: 2,
                private_input_count: 1,
                constraint_count: Some(500),
                proving_key_size: Some(512),
            },
            CircuitInfo {
                id: "range_proof".into(),
                system: ZKPSystem::Noir,
                name: "Range Proof".into(),
                description: "Generic range proof for numeric attributes".into(),
                public_input_count: 2,
                private_input_count: 1,
                constraint_count: Some(800),
                proving_key_size: Some(768),
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_engine() {
        let engine = MockZKPEngine;
        let request = ProofRequest {
            circuit_id: "age_verification".into(),
            public_inputs: vec!["25".into(), "21".into()],
            private_inputs: vec![vec![1u8; 32]],
        };

        let proof = engine.generate_proof(&request).unwrap();
        assert_eq!(proof.circuit_id, "age_verification");

        let result = engine.verify_proof(&proof).unwrap();
        assert!(result.verified);
    }
}
