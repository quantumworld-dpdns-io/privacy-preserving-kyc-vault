use crate::types::VerificationResult;

pub trait ProofVerifier {
    fn verify(&self, proof_bytes: &[u8], public_inputs: &[u8]) -> Result<VerificationResult, String>;
}

pub enum VerifierType {
    NoirVerifier,
    RiscZeroVerifier,
    BBSPlusVerifier,
    Groth16Verifier,
}

pub struct UniversalVerifier {
    verifiers: Vec<(VerifierType, Box<dyn ProofVerifier>)>,
}

impl UniversalVerifier {
    pub fn new() -> Self {
        Self {
            verifiers: Vec::new(),
        }
    }

    pub fn register(&mut self, vtype: VerifierType, verifier: Box<dyn ProofVerifier>) {
        self.verifiers.push((vtype, verifier));
    }

    pub fn verify(&self, proof_bytes: &[u8], public_inputs: &[u8]) -> VerificationResult {
        for (_, verifier) in &self.verifiers {
            if let Ok(result) = verifier.verify(proof_bytes, public_inputs) {
                return result;
            }
        }

        VerificationResult {
            verified: false,
            circuit_id: "unknown".into(),
            verification_time_ms: 0,
            public_outputs: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockVerifier;

    impl ProofVerifier for MockVerifier {
        fn verify(&self, _proof: &[u8], _inputs: &[u8]) -> Result<VerificationResult, String> {
            Ok(VerificationResult {
                verified: true,
                circuit_id: "test".into(),
                verification_time_ms: 1,
                public_outputs: None,
            })
        }
    }

    #[test]
    fn test_universal_verifier() {
        let mut uv = UniversalVerifier::new();
        uv.register(VerifierType::NoirVerifier, Box::new(MockVerifier));

        let result = uv.verify(b"proof", b"inputs");
        assert!(result.verified);
    }
}
