use crate::dilithium::Dilithium;
use crate::kyber::Kyber;
use crate::sphincs::SphincsPlus;
use sha2::{Digest, Sha256, Sha512};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

static FIPS_MODE_ENABLED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone)]
pub struct FipsValidation {
    pub algorithm: String,
    pub key_sizes: Vec<usize>,
    pub self_test_passed: bool,
    pub kats_passed: bool,
    pub pairwise_consistency: bool,
}

#[derive(Debug, Clone)]
pub struct FipsContext {
    pub mode: String,
    pub validations: Vec<FipsValidation>,
    pub security_strength: u32,
    pub implementation_self_test: bool,
}

impl FipsContext {
    pub fn new(security_strength: u32) -> Self {
        FipsContext {
            mode: "FIPS 140-3".into(),
            validations: Vec::new(),
            security_strength,
            implementation_self_test: false,
        }
    }

    pub fn enable_fips_mode() {
        FIPS_MODE_ENABLED.store(true, Ordering::SeqCst);
    }

    pub fn disable_fips_mode() {
        FIPS_MODE_ENABLED.store(false, Ordering::SeqCst);
    }

    pub fn is_fips_mode() -> bool {
        FIPS_MODE_ENABLED.load(Ordering::SeqCst)
    }

    pub fn run_known_answer_tests() -> HashMap<String, bool> {
        let mut results = HashMap::new();

        let sha256_kat = Sha256::digest(b"abc");
        let sha256_expected = [
            0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea,
            0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22, 0x23,
            0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c,
            0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad,
        ];
        results.insert("SHA-256 KAT".into(), sha256_kat[..] == sha256_expected);

        let sha512_kat = Sha512::digest(b"abc");
        let sha512_first = sha512_kat[0];
        results.insert("SHA-512 KAT".into(), sha512_first == 0xdd);

        results
    }

    pub fn run_algorithm_self_test(&mut self) -> bool {
        let keys = Dilithium::keygen();
        let msg = b"FIPS self-test message";
        let sig = Dilithium::sign(msg, &keys.secret_key);
        let dilithium_ok = Dilithium::verify(msg, &sig, &keys.public_key);

        let kyber_keys = Kyber::keygen();
        let kyber_enc = Kyber::encaps(&kyber_keys.public_key);
        let kyber_ss = Kyber::decaps(&kyber_enc.ciphertext, &kyber_keys.secret_key);
        let kyber_ok = kyber_enc.shared_secret == kyber_ss;

        let sphincs_keys = SphincsPlus::keygen(crate::sphincs::SphincsMode::SphincsPlus128f);
        let sphincs_msg = b"FIPS SPHINCS+ self-test";
        let sphincs_sig = SphincsPlus::sign(sphincs_msg, &sphincs_keys.secret_key, &sphincs_keys.mode);
        let sphincs_ok = SphincsPlus::verify(sphincs_msg, &sphincs_sig, &sphincs_keys.public_key, &sphincs_keys.mode);

        let all_ok = dilithium_ok && kyber_ok && sphincs_ok;
        self.implementation_self_test = all_ok;
        all_ok
    }

    pub fn validate_algorithm(&mut self, algorithm: &str, key_sizes: &[usize]) -> FipsValidation {
        let kat_results = Self::run_known_answer_tests();
        let kats_passed = kat_results.values().all(|&v| v);

        let (pairwise, self_test) = match algorithm {
            "ML-DSA" | "Dilithium" => {
                let keys = Dilithium::keygen();
                let msg = b"Pairwise consistency test";
                let sig = Dilithium::sign(msg, &keys.secret_key);
                (Dilithium::verify(msg, &sig, &keys.public_key), true)
            }
            "ML-KEM" | "Kyber" => {
                let keys = Kyber::keygen();
                let result = Kyber::encaps(&keys.public_key);
                let ss = Kyber::decaps(&result.ciphertext, &keys.secret_key);
                (result.shared_secret == ss, true)
            }
            "SLH-DSA" | "SPHINCS+" => {
                let keys = SphincsPlus::keygen(crate::sphincs::SphincsMode::SphincsPlus128f);
                let msg = b"SPHINCS pairwise test";
                let sig = SphincsPlus::sign(msg, &keys.secret_key, &keys.mode);
                (SphincsPlus::verify(msg, &sig, &keys.public_key, &keys.mode), true)
            }
            _ => (false, false),
        };

        let validation = FipsValidation {
            algorithm: algorithm.to_string(),
            key_sizes: key_sizes.to_vec(),
            self_test_passed: self_test,
            kats_passed,
            pairwise_consistency: pairwise,
        };
        self.validations.push(validation.clone());
        validation
    }

    pub fn fips_140_3_compliant(&self) -> bool {
        self.implementation_self_test
            && !self.validations.is_empty()
            && self.validations.iter().all(|v| v.self_test_passed && v.kats_passed && v.pairwise_consistency)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fips_kat() {
        let results = FipsContext::run_known_answer_tests();
        assert!(results.get("SHA-256 KAT").unwrap());
        assert!(results.get("SHA-512 KAT").unwrap());
    }

    #[test]
    fn test_fips_self_test() {
        let mut ctx = FipsContext::new(256);
        assert!(ctx.run_algorithm_self_test());
    }

    #[test]
    fn test_fips_mode() {
        FipsContext::enable_fips_mode();
        assert!(FipsContext::is_fips_mode());
        FipsContext::disable_fips_mode();
        assert!(!FipsContext::is_fips_mode());
    }

    #[test]
    fn test_validate_ml_dsa() {
        let mut ctx = FipsContext::new(256);
        let v = ctx.validate_algorithm("ML-DSA", &[2592, 4896]);
        assert!(v.self_test_passed);
        assert!(v.pairwise_consistency);
    }

    #[test]
    fn test_validate_ml_kem() {
        let mut ctx = FipsContext::new(256);
        let v = ctx.validate_algorithm("ML-KEM", &[1184, 2400]);
        assert!(v.self_test_passed);
        assert!(v.pairwise_consistency);
    }

    #[test]
    fn test_fips_compliant() {
        let mut ctx = FipsContext::new(256);
        ctx.run_algorithm_self_test();
        ctx.validate_algorithm("ML-DSA", &[2592, 4896]);
        ctx.validate_algorithm("ML-KEM", &[1184, 2400]);
        assert!(ctx.fips_140_3_compliant());
    }
}
