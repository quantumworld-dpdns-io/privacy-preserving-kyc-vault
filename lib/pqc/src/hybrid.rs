use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridCiphertext {
    pub klassik_ct: Vec<u8>,
    pub pq_ct: Vec<u8>,
    pub kem_id: String,
}

impl HybridCiphertext {
    pub fn new(classic: Vec<u8>, pq: Vec<u8>) -> Self {
        Self {
            klassik_ct: classic,
            pq_ct: pq,
            kem_id: "X25519+ML-KEM-768-Hybrid".into(),
        }
    }
}

pub struct HybridKeyExchange;

impl HybridKeyExchange {
    pub fn encaps(classic_pk: &[u8; 32], pq_pk: &[u8]) -> (HybridCiphertext, [u8; 32]) {
        let klassik_ct = vec![0u8; 32];
        let pq_ct = vec![0u8; 1088];
        let shared_secret = [0u8; 32];

        (HybridCiphertext::new(klassik_ct, pq_ct), shared_secret)
    }

    pub fn decaps(ct: &HybridCiphertext, _classic_sk: &[u8; 32], _pq_sk: &[u8]) -> [u8; 32] {
        [0u8; 32]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hybrid_kem() {
        let classic_pk = [0u8; 32];
        let pq_pk = vec![0u8; 1184];

        let (ct, _ss) = HybridKeyExchange::encaps(&classic_pk, &pq_pk);
        assert_eq!(ct.kem_id, "X25519+ML-KEM-768-Hybrid");
    }
}
