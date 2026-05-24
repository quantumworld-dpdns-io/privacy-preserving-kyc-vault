use crate::dilithium::Dilithium;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompositeSignature {
    pub ed25519_signature: Vec<u8>,
    pub ml_dsa_signature: Vec<u8>,
    pub ed25519_public_key: Vec<u8>,
    pub ml_dsa_public_key: Vec<u8>,
    pub combiner_salt: [u8; 32],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSigningKey {
    pub ed25519_sk: Vec<u8>,
    pub ml_dsa_sk: Vec<u8>,
}

pub struct HybridSigner;

impl HybridSigner {
    pub fn keygen() -> (HybridSigningKey, (Vec<u8>, Vec<u8>)) {
        let ed25519_keypair = SigningKey::generate(&mut OsRng);
        let ed25519_pk = ed25519_keypair.verifying_key().to_bytes().to_vec();
        let ed25519_sk = ed25519_keypair.to_bytes().to_vec();

        let ml_dsa_keys = Dilithium::keygen();
        let ml_dsa_pk = ml_dsa_keys.public_key.to_vec();
        let ml_dsa_sk = ml_dsa_keys.secret_key.to_vec();

        let sk = HybridSigningKey {
            ed25519_sk,
            ml_dsa_sk,
        };

        (sk, (ed25519_pk, ml_dsa_pk))
    }

    pub fn sign(message: &[u8], sk: &HybridSigningKey) -> CompositeSignature {
        let ed25519_signing_key = SigningKey::from_bytes(&sk.ed25519_sk.try_into().expect("invalid ed25519 sk length"));

        let mut hasher = Sha256::new();
        hasher.update(message);
        let msg_hash = hasher.finalize();

        let ed25519_sig = ed25519_signing_key.sign(&msg_hash);
        let ml_dsa_sig = Dilithium::sign(&msg_hash, &sk.ml_dsa_sk.as_slice().try_into().expect("invalid ml-dsa sk length"));

        let mut salt = [0u8; 32];
        OsRng.fill_bytes(&mut salt);

        CompositeSignature {
            ed25519_signature: ed25519_sig.to_bytes().to_vec(),
            ml_dsa_signature: ml_dsa_sig,
            ed25519_public_key: ed25519_signing_key.verifying_key().to_bytes().to_vec(),
            ml_dsa_public_key: vec![0u8; 2592],
            combiner_salt: salt,
        }
    }

    pub fn verify(message: &[u8], composite: &CompositeSignature) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(message);
        let msg_hash = hasher.finalize();

        let ed25519_pk = match VerifyingKey::from_bytes(&composite.ed25519_public_key.try_into().expect("invalid pk length")) {
            Ok(pk) => pk,
            Err(_) => return false,
        };

        let ed25519_sig = match Signature::from_bytes(&composite.ed25519_signature.try_into().expect("invalid sig length")) {
            Ok(s) => s,
            Err(_) => return false,
        };

        let ed25519_ok = ed25519_pk.verify(&msg_hash, &ed25519_sig).is_ok();

        let ml_dsa_pk: &[u8; 2592] = &composite.ml_dsa_public_key.as_slice().try_into().expect("invalid pk length");
        let ml_dsa_ok = Dilithium::verify(&msg_hash, &composite.ml_dsa_signature, ml_dsa_pk);

        ed25519_ok && ml_dsa_ok
    }

    pub fn combine_single(message: &[u8], ed25519_sig: &[u8], ml_dsa_sig: &[u8], ed25519_pk: &[u8], ml_dsa_pk: &[u8]) -> CompositeSignature {
        let mut salt = [0u8; 32];
        OsRng.fill_bytes(&mut salt);

        CompositeSignature {
            ed25519_signature: ed25519_sig.to_vec(),
            ml_dsa_signature: ml_dsa_sig.to_vec(),
            ed25519_public_key: ed25519_pk.to_vec(),
            ml_dsa_public_key: ml_dsa_pk.to_vec(),
            combiner_salt: salt,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hybrid_keygen() {
        let (_sk, (ed_pk, ml_pk)) = HybridSigner::keygen();
        assert_eq!(ed_pk.len(), 32);
        assert_eq!(ml_pk.len(), 2592);
    }

    #[test]
    fn test_hybrid_sign_verify() {
        let (sk, _) = HybridSigner::keygen();
        let msg = b"Hybrid signature test";
        let composite = HybridSigner::sign(msg, &sk);
        assert!(HybridSigner::verify(msg, &composite));
    }

    #[test]
    fn test_combine_single() {
        let composite = HybridSigner::combine_single(b"test", &[0u8; 64], &[0u8; 4627], &[0u8; 32], &[0u8; 2592]);
        assert_eq!(composite.ed25519_signature.len(), 64);
        assert_eq!(composite.ml_dsa_signature.len(), 4627);
    }
}
