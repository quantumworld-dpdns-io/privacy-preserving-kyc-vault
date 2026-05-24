use serde::{Deserialize, Serialize};
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use curve25519_dalek::{scalar::Scalar, MontgomeryPoint};
use rand::RngCore;
use x25519_dalek::{EphemeralSecret, PublicKey};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HPKECiphertext {
    pub enc: Vec<u8>,
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub kem_id: String,
    pub kdf_id: String,
    pub aead_id: String,
}

pub struct HPKE;

impl HPKE {
    pub fn encrypt(
        recipient_public_key: &[u8; 32],
        plaintext: &[u8],
        aad: &[u8],
    ) -> Result<HPKECiphertext, String> {
        let recipient = PublicKey::from(*recipient_public_key);
        let ephemeral = EphemeralSecret::random_from_rng(OsRng);
        let ephemeral_pub = PublicKey::from(&ephemeral);
        let shared = ephemeral.diffie_hellman(&recipient);

        let cipher = Aes256Gcm::new_from_slice(shared.as_bytes())
            .map_err(|e| format!("AES-GCM init: {}", e))?;

        let nonce_bytes: [u8; 12] = rand::random();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        Ok(HPKECiphertext {
            enc: ephemeral_pub.to_bytes().to_vec(),
            ciphertext,
            nonce: nonce_bytes.to_vec(),
            kem_id: "DHKEM(X25519)".into(),
            kdf_id: "HKDF-SHA256".into(),
            aead_id: "AES-256-GCM".into(),
        })
    }

    pub fn decrypt(
        secret_key: &[u8; 32],
        ct: &HPKECiphertext,
        aad: &[u8],
    ) -> Result<Vec<u8>, String> {
        let static_secret = StaticSecret::from(*secret_key);
        let ephemeral_pub = PublicKey::from(<[u8; 32]>::try_from(ct.enc.as_slice()).map_err(|_| "Invalid enc length")?);
        let shared = static_secret.diffie_hellman(&ephemeral_pub);

        let cipher = Aes256Gcm::new_from_slice(shared.as_bytes())
            .map_err(|e| format!("AES-GCM init: {}", e))?;

        let nonce = Nonce::from_slice(&ct.nonce);

        cipher
            .decrypt(nonce, ct.ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))
    }
}

pub fn generate_keypair() -> (StaticSecret, PublicKey) {
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    (secret, public)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hpke_roundtrip() {
        let (secret, public) = generate_keypair();
        let plaintext = b"Hello, KYC Vault!";
        let aad = b"test-aad";

        let ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
        let decrypted = HPKE::decrypt(secret.to_bytes(), &ct, aad).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_hpke_wrong_key_fails() {
        let (secret, _) = generate_keypair();
        let (_, public2) = generate_keypair();
        let plaintext = b"secret data";

        let ct = HPKE::encrypt(public2.as_bytes(), plaintext, b"").unwrap();
        let result = HPKE::decrypt(secret.to_bytes(), &ct, b"");
        assert!(result.is_err());
    }
}
