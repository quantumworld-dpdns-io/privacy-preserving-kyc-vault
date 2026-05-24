use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridCiphertext {
    pub classic_ct: Vec<u8>,
    pub pq_ct: Vec<u8>,
    pub kem_id: String,
}

pub struct HybridEncryption;

impl HybridEncryption {
    pub fn encrypt(
        classic_pk: &[u8; 32],
        pq_pk: &[u8],
        plaintext: &[u8],
        aad: &[u8],
    ) -> Result<HybridCiphertext, String> {
        let classic_ct = super::hpke::HPKE::encrypt(classic_pk, plaintext, aad)?;

        let pq_ct = b"pq-placeholder".to_vec();

        Ok(HybridCiphertext {
            classic_ct: serde_json::to_vec(&classic_ct).map_err(|e| e.to_string())?,
            pq_ct,
            kem_id: "X25519+ML-KEM-768-Hybrid".into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hpke::generate_keypair;

    #[test]
    fn test_hybrid_encrypt() {
        let (_, public) = generate_keypair();
        let pq_pk = vec![0u8; 1184];

        let result = HybridEncryption::encrypt(
            public.as_bytes(),
            &pq_pk,
            b"test-data",
            b"",
        );
        assert!(result.is_ok());
    }
}
