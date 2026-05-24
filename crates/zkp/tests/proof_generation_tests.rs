use kyc_vault_zkp::engine::{MockZKPEngine, ZKPEngine, ZKPEngineRegistry};
use kyc_vault_zkp::types::{CircuitInfo, ProofRequest, ZKPSystem};
use kyc_vault_zkp::verifier::{ProofVerifier, UniversalVerifier, VerifierType};

#[test]
fn test_mock_engine_proof_generation() {
    let engine = MockZKPEngine;
    let request = ProofRequest {
        circuit_id: "age_verification".into(),
        public_inputs: vec!["30".into(), "18".into()],
        private_inputs: vec![vec![2u8; 32]],
    };

    let proof = engine.generate_proof(&request).unwrap();
    assert_eq!(proof.circuit_id, "age_verification");
    assert!(proof.proof_id.starts_with("proof-"));
    assert_eq!(proof.proof.len(), 64);
    assert!(proof.proving_time_ms > 0);
}

#[test]
fn test_mock_engine_verification() {
    let engine = MockZKPEngine;
    let request = ProofRequest {
        circuit_id: "range_proof".into(),
        public_inputs: vec!["500".into(), "1000".into()],
        private_inputs: vec![vec![3u8; 32]],
    };

    let proof = engine.generate_proof(&request).unwrap();
    let result = engine.verify_proof(&proof).unwrap();
    assert!(result.verified);
    assert_eq!(result.circuit_id, "range_proof");
    assert!(result.verification_time_ms > 0);
}

#[test]
fn test_engine_registry_register_and_get() {
    let mut registry = ZKPEngineRegistry::new();
    registry.register("mock", Box::new(MockZKPEngine));

    let engine = registry.get("mock");
    assert!(engine.is_some());

    let engine = registry.get("nonexistent");
    assert!(engine.is_none());
}

#[test]
fn test_engine_registry_multiple_engines() {
    let mut registry = ZKPEngineRegistry::new();
    registry.register("noir", Box::new(MockZKPEngine));
    registry.register("risc0", Box::new(MockZKPEngine));
    registry.register("bbs+", Box::new(MockZKPEngine));

    assert!(registry.get("noir").is_some());
    assert!(registry.get("risc0").is_some());
    assert!(registry.get("bbs+").is_some());
    assert!(registry.get("groth16").is_none());
}

#[test]
fn test_list_circuits() {
    let engine = MockZKPEngine;
    let circuits = engine.list_circuits();
    assert_eq!(circuits.len(), 2);

    let age_circuit = circuits
        .iter()
        .find(|c| c.id == "age_verification")
        .unwrap();
    assert_eq!(age_circuit.public_input_count, 2);
    assert_eq!(age_circuit.private_input_count, 1);
    assert_eq!(age_circuit.system, ZKPSystem::Noir);

    let range_circuit = circuits
        .iter()
        .find(|c| c.id == "range_proof")
        .unwrap();
    assert_eq!(range_circuit.name, "Range Proof");
    assert!(range_circuit.constraint_count.unwrap() > 0);
}

#[test]
fn test_get_circuit_info() {
    let engine = MockZKPEngine;
    let info = engine.get_circuit_info("range_proof").unwrap();
    assert_eq!(info.id, "range_proof");
    assert_eq!(info.system, ZKPSystem::Noir);
    assert!(info.proving_key_size.is_some());
}

#[test]
fn test_universal_verifier_with_mocks() {
    struct AlwaysPassVerifier;
    impl ProofVerifier for AlwaysPassVerifier {
        fn verify(
            &self,
            _proof: &[u8],
            _public: &[u8],
        ) -> Result<kyc_vault_zkp::types::VerificationResult, String> {
            Ok(kyc_vault_zkp::types::VerificationResult {
                verified: true,
                circuit_id: "test".into(),
                verification_time_ms: 2,
                public_outputs: None,
            })
        }
    }

    struct AlwaysFailVerifier;
    impl ProofVerifier for AlwaysFailVerifier {
        fn verify(
            &self,
            _proof: &[u8],
            _public: &[u8],
        ) -> Result<kyc_vault_zkp::types::VerificationResult, String> {
            Err("always fails".into())
        }
    }

    let mut uv = UniversalVerifier::new();
    uv.register(VerifierType::NoirVerifier, Box::new(AlwaysFailVerifier));
    uv.register(VerifierType::Groth16Verifier, Box::new(AlwaysPassVerifier));

    let result = uv.verify(b"some-proof", b"public-inputs");
    assert!(result.verified);
    assert_eq!(result.circuit_id, "test");
}

#[test]
fn test_universal_verifier_all_fail() {
    struct FailVerifier;
    impl ProofVerifier for FailVerifier {
        fn verify(
            &self,
            _proof: &[u8],
            _public: &[u8],
        ) -> Result<kyc_vault_zkp::types::VerificationResult, String> {
            Err("invalid".into())
        }
    }

    let mut uv = UniversalVerifier::new();
    uv.register(VerifierType::NoirVerifier, Box::new(FailVerifier));
    uv.register(VerifierType::RiscZeroVerifier, Box::new(FailVerifier));

    let result = uv.verify(b"bad-proof", b"bad-inputs");
    assert!(!result.verified);
    assert_eq!(result.circuit_id, "unknown");
}

#[test]
fn test_proof_request_serialization() {
    let request = ProofRequest {
        circuit_id: "test_circuit".into(),
        public_inputs: vec!["input1".into(), "input2".into()],
        private_inputs: vec![vec![0u8; 32], vec![1u8; 64]],
    };

    let json = serde_json::to_string(&request).unwrap();
    assert!(json.contains("test_circuit"));
    assert!(json.contains("input1"));

    let restored: ProofRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.circuit_id, request.circuit_id);
    assert_eq!(restored.public_inputs.len(), 2);
    assert_eq!(restored.private_inputs.len(), 2);
}

#[test]
fn test_circuit_info_systems() {
    let circuits = vec![
        CircuitInfo {
            id: "c1".into(),
            system: ZKPSystem::Noir,
            name: "Noir Circuit".into(),
            description: "".into(),
            public_input_count: 2,
            private_input_count: 3,
            constraint_count: Some(1000),
            proving_key_size: Some(2048),
        },
        CircuitInfo {
            id: "c2".into(),
            system: ZKPSystem::RiscZero,
            name: "RISC Zero Circuit".into(),
            description: "".into(),
            public_input_count: 1,
            private_input_count: 1,
            constraint_count: None,
            proving_key_size: None,
        },
    ];

    assert_eq!(circuits[0].system, ZKPSystem::Noir);
    assert_eq!(circuits[1].system, ZKPSystem::RiscZero);
    assert!(circuits[0].constraint_count.unwrap() > circuits[1].constraint_count.unwrap_or(0));
}
