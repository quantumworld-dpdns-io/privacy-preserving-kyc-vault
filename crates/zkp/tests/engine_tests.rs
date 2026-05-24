use kyc_vault_zkp::engine::{MockZKPEngine, ZKPEngine, ZKPEngineRegistry};
use kyc_vault_zkp::types::{CircuitInfo, ProofRequest, ZKPSystem};
use kyc_vault_zkp::verifier::{ProofVerifier, UniversalVerifier, VerifierType};

fn make_request(circuit_id: &str, public: Vec<&str>) -> ProofRequest {
    ProofRequest {
        circuit_id: circuit_id.into(),
        public_inputs: public.into_iter().map(String::from).collect(),
        private_inputs: vec![vec![0u8; 32]],
    }
}

#[test]
fn test_mock_engine_proof_generation() {
    let engine = MockZKPEngine;
    let request = make_request("age_verification", vec!["25", "18"]);
    let proof = engine.generate_proof(&request).unwrap();

    assert_eq!(proof.circuit_id, "age_verification");
    assert!(proof.proof_id.starts_with("proof-"));
    assert_eq!(proof.proof.len(), 64);
    assert!(proof.proving_time_ms > 0);
}

#[test]
fn test_mock_engine_proof_verification() {
    let engine = MockZKPEngine;
    let request = make_request("range_proof", vec!["100", "1000"]);
    let proof = engine.generate_proof(&request).unwrap();
    let result = engine.verify_proof(&proof).unwrap();

    assert!(result.verified);
    assert_eq!(result.circuit_id, "range_proof");
    assert!(result.verification_time_ms > 0);
}

#[test]
fn test_engine_registry_register_and_retrieve() {
    let mut registry = ZKPEngineRegistry::new();
    registry.register("noir", Box::new(MockZKPEngine));
    registry.register("risc0", Box::new(MockZKPEngine));

    assert!(registry.get("noir").is_some());
    assert!(registry.get("risc0").is_some());
    assert!(registry.get("groth16").is_none());
}

#[test]
fn test_engine_registry_overwrite() {
    let mut registry = ZKPEngineRegistry::new();
    registry.register("dup", Box::new(MockZKPEngine));
    registry.register("dup", Box::new(MockZKPEngine));
    assert!(registry.get("dup").is_some());
}

#[test]
fn test_mock_engine_list_circuits() {
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
}

#[test]
fn test_mock_engine_get_circuit_info() {
    let engine = MockZKPEngine;
    let info = engine.get_circuit_info("range_proof").unwrap();

    assert_eq!(info.id, "range_proof");
    assert_eq!(info.system, ZKPSystem::Noir);
    assert_eq!(info.name, "Circuit: range_proof");
    assert!(info.proving_key_size.is_some());
}

#[test]
fn test_get_circuit_info_for_unknown() {
    let engine = MockZKPEngine;
    let info = engine.get_circuit_info("nonexistent").unwrap();
    assert_eq!(info.id, "nonexistent");
}

#[test]
fn test_universal_verifier_with_multiple_verifiers() {
    struct GoodVerifier;
    impl ProofVerifier for GoodVerifier {
        fn verify(&self, _proof: &[u8], _public: &[u8]) -> Result<kyc_vault_zkp::types::VerificationResult, String> {
            Ok(kyc_vault_zkp::types::VerificationResult {
                verified: true,
                circuit_id: "good".into(),
                verification_time_ms: 1,
                public_outputs: None,
            })
        }
    }

    struct BadVerifier;
    impl ProofVerifier for BadVerifier {
        fn verify(&self, _proof: &[u8], _public: &[u8]) -> Result<kyc_vault_zkp::types::VerificationResult, String> {
            Err("bad verifier".into())
        }
    }

    let mut uv = UniversalVerifier::new();
    uv.register(VerifierType::NoirVerifier, Box::new(BadVerifier));
    uv.register(VerifierType::Groth16Verifier, Box::new(GoodVerifier));

    let result = uv.verify(b"proof", b"inputs");
    assert!(result.verified);
    assert_eq!(result.circuit_id, "good");
}

#[test]
fn test_universal_verifier_all_fail() {
    struct FailingVerifier;
    impl ProofVerifier for FailingVerifier {
        fn verify(&self, _proof: &[u8], _public: &[u8]) -> Result<kyc_vault_zkp::types::VerificationResult, String> {
            Err("invalid proof".into())
        }
    }

    let mut uv = UniversalVerifier::new();
    uv.register(VerifierType::NoirVerifier, Box::new(FailingVerifier));
    uv.register(VerifierType::RiscZeroVerifier, Box::new(FailingVerifier));

    let result = uv.verify(b"bad", b"bad");
    assert!(!result.verified);
    assert_eq!(result.circuit_id, "unknown");
}

#[test]
fn test_proof_request_serialization() {
    let request = ProofRequest {
        circuit_id: "test_circuit".into(),
        public_inputs: vec!["a".into(), "b".into()],
        private_inputs: vec![vec![1u8; 16]],
    };

    let json = serde_json::to_string(&request).unwrap();
    assert!(json.contains("test_circuit"));

    let restored: ProofRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.circuit_id, "test_circuit");
    assert_eq!(restored.public_inputs.len(), 2);
}

#[test]
fn test_circuit_info_systems() {
    let noir = CircuitInfo {
        id: "c1".into(),
        system: ZKPSystem::Noir,
        name: "Noir".into(),
        description: "".into(),
        public_input_count: 2,
        private_input_count: 1,
        constraint_count: Some(500),
        proving_key_size: Some(1024),
    };
    let risc0 = CircuitInfo {
        id: "c2".into(),
        system: ZKPSystem::RiscZero,
        name: "Risc0".into(),
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

#[test]
fn test_proof_response_fields() {
    let engine = MockZKPEngine;
    let request = make_request("age_verification", vec!["30", "21"]);
    let proof = engine.generate_proof(&request).unwrap();

    assert!(!proof.proof_id.is_empty());
    assert!(!proof.proof.is_empty());
    assert!(!proof.public_outputs.is_empty());
    assert!(proof.proving_time_ms > 0);
}

#[test]
fn test_multiple_proof_generations_produce_different_ids() {
    let engine = MockZKPEngine;
    let request = make_request("age_verification", vec!["25", "18"]);
    let p1 = engine.generate_proof(&request).unwrap();
    let p2 = engine.generate_proof(&request).unwrap();
    assert_ne!(p1.proof_id, p2.proof_id);
}
