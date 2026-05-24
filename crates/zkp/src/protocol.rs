use crate::engine::ZKPEngine;
use crate::types::*;
use std::collections::HashMap;

pub struct ZKPProtocol {
    engines: HashMap<String, Box<dyn ZKPEngine>>,
    circuit_map: HashMap<String, String>,
}

impl ZKPProtocol {
    pub fn new() -> Self {
        Self {
            engines: HashMap::new(),
            circuit_map: HashMap::new(),
        }
    }

    pub fn register_engine(&mut self, name: &str, engine: Box<dyn ZKPEngine>) {
        self.engines.insert(name.to_string(), engine);
    }

    pub fn register_circuit(&mut self, circuit_id: &str, engine_name: &str) {
        self.circuit_map
            .insert(circuit_id.to_string(), engine_name.to_string());
    }

    pub fn resolve_engine(&self, circuit_id: &str) -> Result<&Box<dyn ZKPEngine>, String> {
        let engine_name = self
            .circuit_map
            .get(circuit_id)
            .ok_or_else(|| format!("No engine mapped for circuit: {}", circuit_id))?;

        self.engines
            .get(engine_name)
            .ok_or_else(|| format!("Engine not registered: {}", engine_name))
    }

    pub fn generate_proof(&self, request: &ProofRequest) -> Result<ProofResponse, String> {
        let engine = self.resolve_engine(&request.circuit_id)?;
        engine.generate_proof(request)
    }

    pub fn verify_proof(&self, proof: &ProofResponse) -> Result<VerificationResult, String> {
        let engine = self.resolve_engine(&proof.circuit_id)?;
        engine.verify_proof(proof)
    }

    pub fn get_circuit_info(&self, circuit_id: &str) -> Result<CircuitInfo, String> {
        let engine = self.resolve_engine(circuit_id)?;
        engine.get_circuit_info(circuit_id)
    }

    pub fn list_engines(&self) -> Vec<String> {
        self.engines.keys().cloned().collect()
    }

    pub fn list_circuits(&self) -> Vec<(String, String)> {
        self.circuit_map
            .iter()
            .map(|(c, e)| (c.clone(), e.clone()))
            .collect()
    }
}

impl Default for ZKPProtocol {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::MockZKPEngine;

    fn setup_protocol() -> ZKPProtocol {
        let mut protocol = ZKPProtocol::new();
        protocol.register_engine("noir", Box::new(MockZKPEngine));
        protocol.register_engine("groth16", Box::new(MockZKPEngine));
        protocol.register_circuit("age_verification", "noir");
        protocol.register_circuit("reputation_score", "groth16");
        protocol
    }

    #[test]
    fn test_protocol_resolve_engine() {
        let protocol = setup_protocol();
        let engine = protocol.resolve_engine("age_verification").unwrap();
        let info = engine.get_circuit_info("age_verification").unwrap();
        assert_eq!(info.id, "age_verification");
    }

    #[test]
    fn test_protocol_resolve_unknown_circuit() {
        let protocol = setup_protocol();
        let result = protocol.resolve_engine("unknown_circuit");
        assert!(result.is_err());
    }

    #[test]
    fn test_protocol_generate_proof() {
        let protocol = setup_protocol();
        let request = ProofRequest {
            circuit_id: "age_verification".into(),
            public_inputs: vec!["25".into(), "21".into()],
            private_inputs: vec![vec![1u8; 32]],
        };
        let proof = protocol.generate_proof(&request).unwrap();
        assert_eq!(proof.circuit_id, "age_verification");
    }

    #[test]
    fn test_protocol_verify_proof() {
        let protocol = setup_protocol();
        let proof = ProofResponse {
            proof_id: "test".into(),
            proof: vec![],
            public_outputs: vec![],
            circuit_id: "age_verification".into(),
            proving_time_ms: 0,
        };
        let result = protocol.verify_proof(&proof).unwrap();
        assert!(result.verified);
    }

    #[test]
    fn test_protocol_list_engines() {
        let protocol = setup_protocol();
        let engines = protocol.list_engines();
        assert!(engines.contains(&"noir".to_string()));
        assert!(engines.contains(&"groth16".to_string()));
    }

    #[test]
    fn test_protocol_list_circuits() {
        let protocol = setup_protocol();
        let circuits = protocol.list_circuits();
        assert!(circuits.contains(&("age_verification".into(), "noir".into())));
        assert!(circuits.contains(&("reputation_score".into(), "groth16".into())));
    }

    #[test]
    fn test_protocol_unknown_circuit_proof() {
        let protocol = setup_protocol();
        let request = ProofRequest {
            circuit_id: "nonexistent".into(),
            public_inputs: vec![],
            private_inputs: vec![],
        };
        let result = protocol.generate_proof(&request);
        assert!(result.is_err());
    }
}
