use crate::kyber::Kyber;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x25519_dalek::{EphemeralSecret, PublicKey, SharedSecret as X25519Shared};
use rand::rngs::OsRng;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridCiphertext {
    pub x25519_ct: Vec<u8>,
    pub kyber_ct: [u8; 1088],
    pub x25519_pk: Vec<u8>,
    pub kyber_pk: [u8; 1184],
}

#[derive(Debug, Clone)]
pub struct HybridSharedSecret {
    pub combined: [u8; 64],
    pub kem_id: String,
}

pub struct HybridKEM;

impl HybridKEM {
    pub fn encaps(x25519_pk: &[u8; 32], kyber_pk: &[u8; 1184]) -> (HybridCiphertext, HybridSharedSecret) {
        let x25519_pub = PublicKey::from(*x25519_pk);
        let x25519_ephemeral = EphemeralSecret::random_from_rng(OsRng);
        let x25519_ss: X25519Shared = x25519_ephemeral.diffie_hellman(&x25519_pub);

        let kyber_result = Kyber::encaps(kyber_pk);

        let mut combined = [0u8; 64];
        combined[..32].copy_from_slice(x25519_ss.as_bytes());
        combined[32..].copy_from_slice(&kyber_result.shared_secret);

        let mut mixed = [0u8; 64];
        let mut hasher = Sha256::new();
        hasher.update(&combined[..]);
        let hash = hasher.finalize();
        mixed[..32].copy_from_slice(&hash);
        mixed[32..].copy_from_slice(&kyber_result.shared_secret);

        let ct = HybridCiphertext {
            x25519_ct: x25519_ss.as_bytes().to_vec(),
            kyber_ct: kyber_result.ciphertext,
            x25519_pk: x25519_pk.to_vec(),
            kyber_pk: *kyber_pk,
        };

        let ss = HybridSharedSecret {
            combined: mixed,
            kem_id: "X25519+ML-KEM-768-Hybrid".into(),
        };

        (ct, ss)
    }

    pub fn decaps(ct: &HybridCiphertext, x25519_sk: &[u8; 32], kyber_sk: &[u8; 2400]) -> HybridSharedSecret {
        let x25519_ss = X25519Shared::from(*x25519_sk);
        let kyber_ss = Kyber::decaps(&ct.kyber_ct, kyber_sk);

        let mut combined = [0u8; 64];
        combined[..32].copy_from_slice(x25519_ss.as_bytes());
        combined[32..].copy_from_slice(&kyber_ss);

        let mut mixed = [0u8; 64];
        let mut hasher = Sha256::new();
        hasher.update(&combined[..]);
        let hash = hasher.finalize();
        mixed[..32].copy_from_slice(&hash);
        mixed[32..].copy_from_slice(&kyber_ss);

        HybridSharedSecret {
            combined: mixed,
            kem_id: "X25519+ML-KEM-768-Hybrid".into(),
        }
    }

    pub fn combine_shares(x25519_ss: &[u8; 32], kyber_ss: &[u8; 32]) -> HybridSharedSecret {
        let mut combined = [0u8; 64];
        combined[..32].copy_from_slice(x25519_ss);
        combined[32..].copy_from_slice(kyber_ss);

        let mut mixed = [0u8; 64];
        let mut hasher = Sha256::new();
        hasher.update(&combined[..]);
        let hash = hasher.finalize();
        mixed[..32].copy_from_slice(&hash);
        mixed[32..].copy_from_slice(kyber_ss);

        HybridSharedSecret {
            combined: mixed,
            kem_id: "X25519+ML-KEM-768-Hybrid".into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hybrid_kem_encaps() {
        let x25519_pk = [0u8; 32];
        let kyber_pk = [0u8; 1184];
        let (_ct, ss) = HybridKEM::encaps(&x25519_pk, &kyber_pk);
        assert_eq!(ss.combined.len(), 64);
        assert_eq!(ss.kem_id, "X25519+ML-KEM-768-Hybrid");
    }

    #[test]
    fn test_combine_shares() {
        let x25519_ss = [1u8; 32];
        let kyber_ss = [2u8; 32];
        let ss = HybridKEM::combine_shares(&x25519_ss, &kyber_ss);
        assert_eq!(ss.combined.len(), 64);
        assert_ne!(ss.combined[..32], [0u8; 32]);
    }

    #[test]
    fn test_kem_id_is_correct() {
        let x25519_pk = [0u8; 32];
        let kyber_pk = [0u8; 1184];
        let (_ct, ss) = HybridKEM::encaps(&x25519_pk, &kyber_pk);
        assert_eq!(ss.kem_id, "X25519+ML-KEM-768-Hybrid");
    }
}
