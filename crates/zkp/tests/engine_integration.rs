use kyc_vault_zkp::engine::{MockZKPEngine, ZKPEngine, ZKPEngineRegistry};
use kyc_vault_zkp::types::{ProofRequest, ZKPSystem};

fn make_request(circuit_id: &str, public: Vec<&str>) -> ProofRequest {
    ProofRequest {
        circuit_id: circuit_id.into(),
        public_inputs: public.into_iter().map(String::from).collect(),
        private_inputs: vec![vec![0u8; 32]],
    }
}

#[test]
fn test_engine_generate_age_proof() {
    let engine = MockZKPEngine;
    let request = make_request("age_verification", vec!["25", "18"]);
    let proof = engine.generate_proof(&request).unwrap();

    assert_eq!(proof.circuit_id, "age_verification");
    assert!(proof.proof_id.starts_with("proof-"));
    assert_eq!(proof.proof.len(), 64);
    assert!(proof.proving_time_ms > 0);
}

#[test]
fn test_engine_generate_range_proof() {
    let engine = MockZKPEngine;
    let request = make_request("range_proof", vec!["100", "1000"]);
    let proof = engine.generate_proof(&request).unwrap();

    assert_eq!(proof.circuit_id, "range_proof");
    assert_eq!(proof.proof.len(), 64);
}

#[test]
fn test_engine_generate_nationality_proof() {
    let engine = MockZKPEngine;
    let request = make_request("nationality_check", vec!["US", "CA"]);
    let proof = engine.generate_proof(&request).unwrap();

    assert_eq!(proof.circuit_id, "nationality_check");
}

#[test]
fn test_engine_verify_valid_proof() {
    let engine = MockZKPEngine;
    let request = make_request("range_proof", vec!["100", "1000"]);
    let proof = engine.generate_proof(&request).unwrap();
    let result = engine.verify_proof(&proof).unwrap();

    assert!(result.verified);
    assert_eq!(result.circuit_id, "range_proof");
    assert!(result.verification_time_ms > 0);
}

#[test]
fn test_engine_verify_multiple_proofs() {
    let engine = MockZKPEngine;
    let circuits = vec!["age_verification", "range_proof", "nationality_check"];

    for circuit in circuits {
        let request = make_request(circuit, vec!["1", "2"]);
        let proof = engine.generate_proof(&request).unwrap();
        let result = engine.verify_proof(&proof).unwrap();

        assert!(result.verified);
        assert_eq!(result.circuit_id, circuit);
    }
}

#[test]
fn test_engine_list_circuits() {
    let engine = MockZKPEngine;
    let circuits = engine.list_circuits();

    assert_eq!(circuits.len(), 2);

    let age = circuits.iter().find(|c| c.id == "age_verification").unwrap();
    assert_eq!(age.system, ZKPSystem::Noir);
    assert_eq!(age.public_input_count, 2);
    assert_eq!(age.private_input_count, 1);
    assert!(age.constraint_count.unwrap() > 0);

    let range = circuits.iter().find(|c| c.id == "range_proof").unwrap();
    assert_eq!(range.name, "Range Proof");
    assert!(range.proving_key_size.unwrap() > 0);
}

#[test]
fn test_engine_get_circuit_info() {
    let engine = MockZKPEngine;
    let info = engine.get_circuit_info("range_proof").unwrap();

    assert_eq!(info.id, "range_proof");
    assert_eq!(info.system, ZKPSystem::Noir);
    assert_eq!(info.name, "Circuit: range_proof");
    assert!(info.proving_key_size.is_some());
}

#[test]
fn test_engine_get_circuit_info_unknown() {
    let engine = MockZKPEngine;
    let info = engine.get_circuit_info("nonexistent_circuit").unwrap();

    assert_eq!(info.id, "nonexistent_circuit");
    assert_eq!(info.name, "Circuit: nonexistent_circuit");
}

#[test]
fn test_proof_request_serialization_roundtrip() {
    let request = ProofRequest {
        circuit_id: "serialize_test".into(),
        public_inputs: vec!["pub1".into(), "pub2".into()],
        private_inputs: vec![vec![1u8; 16], vec![2u8; 32]],
    };

    let json = serde_json::to_string(&request).unwrap();
    assert!(json.contains("serialize_test"));
    assert!(json.contains("pub1"));

    let restored: ProofRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.circuit_id, "serialize_test");
    assert_eq!(restored.public_inputs.len(), 2);
    assert_eq!(restored.private_inputs.len(), 2);
}

#[test]
fn test_engine_registry_register_and_get() {
    let mut registry = ZKPEngineRegistry::new();

    assert!(registry.get("noir").is_none());

    registry.register("noir", Box::new(MockZKPEngine));
    registry.register("risc0", Box::new(MockZKPEngine));

    assert!(registry.get("noir").is_some());
    assert!(registry.get("risc0").is_some());
    assert!(registry.get("groth16").is_none());
}

#[test]
fn test_engine_registry_overwrite_existing() {
    let mut registry = ZKPEngineRegistry::new();
    registry.register("engine_a", Box::new(MockZKPEngine));
    registry.register("engine_a", Box::new(MockZKPEngine));

    assert!(registry.get("engine_a").is_some());
}

#[test]
fn test_multiple_proofs_have_unique_ids() {
    let engine = MockZKPEngine;
    let request = make_request("age_verification", vec!["25", "18"]);

    let p1 = engine.generate_proof(&request).unwrap();
    let p2 = engine.generate_proof(&request).unwrap();
    let p3 = engine.generate_proof(&request).unwrap();

    assert_ne!(p1.proof_id, p2.proof_id);
    assert_ne!(p2.proof_id, p3.proof_id);
}

#[test]
fn test_proof_response_fields() {
    let engine = MockZKPEngine;
    let request = make_request("age_verification", vec!["30", "21"]);
    let proof = engine.generate_proof(&request).unwrap();

    assert!(!proof.proof_id.is_empty());
    assert!(!proof.proof.is_empty());
    assert!(!proof.public_outputs.is_empty());
    assert!(proof.proving_time_ms > 0);
    assert_eq!(proof.circuit_id, "age_verification");
}

#[test]
fn test_circuit_info_system_variants() {
    let noir = kyc_vault_zkp::types::CircuitInfo {
        id: "noir_circuit".into(),
        system: ZKPSystem::Noir,
        name: "Noir Circuit".into(),
        description: "".into(),
        public_input_count: 2,
        private_input_count: 1,
        constraint_count: Some(500),
        proving_key_size: Some(1024),
    };

    let risc0 = kyc_vault_zkp::types::CircuitInfo {
        id: "risc0_circuit".into(),
        system: ZKPSystem::RiscZero,
        name: "Risc0 Circuit".into(),
        description: "".into(),
        public_input_count: 1,
        private_input_count: 2,
        constraint_count: None,
        proving_key_size: None,
    };

    assert_eq!(noir.system, ZKPSystem::Noir);
    assert_eq!(risc0.system, ZKPSystem::RiscZero);
    assert!(noir.constraint_count.unwrap() > 0);
    assert!(risc0.constraint_count.is_none());
}
