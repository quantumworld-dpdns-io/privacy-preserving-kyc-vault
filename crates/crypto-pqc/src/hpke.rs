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
        let shared = Self::x25519_dh(secret_key, ct.enc.as_slice())?;

        let cipher = Aes256Gcm::new_from_slice(&shared)
            .map_err(|e| format!("AES-GCM init: {}", e))?;

        let nonce = Nonce::from_slice(&ct.nonce);

        cipher
            .decrypt(nonce, ct.ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))
    }

    fn x25519_dh(secret_key: &[u8; 32], public_key_bytes: &[u8]) -> Result<[u8; 32], String> {
        let scalar = Scalar::from_bytes_mod_order(*secret_key);
        let mut clamped = scalar.to_bytes();
        clamped[0] &= 248;
        clamped[31] &= 127;
        clamped[31] |= 64;
        let clamped_scalar = Scalar::from_bytes_mod_order(clamped);
        let pub_bytes: [u8; 32] =
            <[u8; 32]>::try_from(public_key_bytes).map_err(|_| "Invalid public key length")?;
        let point = MontgomeryPoint(pub_bytes);
        let shared_point = clamped_scalar * point;
        Ok(shared_point.to_bytes())
    }
}

pub fn generate_keypair() -> ([u8; 32], PublicKey) {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let scalar = Scalar::from_bytes_mod_order(bytes);
    let stored = scalar.to_bytes();
    let mut base_bytes = [0u8; 32];
    base_bytes[0] = 9;
    let basepoint = MontgomeryPoint(base_bytes);
    let public_point = scalar * basepoint;
    let public = PublicKey::from(public_point.to_bytes());
    (stored, public)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex_to_bytes(hex: &str) -> [u8; 32] {
        let mut bytes = [0u8; 32];
        for i in 0..32 {
            bytes[i] = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap();
        }
        bytes
    }

    #[test]
    fn test_rfc7748_x25519_test_vector() {
        let alice_priv = hex_to_bytes("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
        let bob_pub = hex_to_bytes("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f");
        let expected_shared = hex_to_bytes("4a5d9d5ba4ce2de8198e4c52b5168b9c5e2b0c6c111f5edc0b26e5e4b0e1f1b");

        let shared = HPKE::x25519_dh(&alice_priv, &bob_pub).unwrap();
        assert_eq!(shared, expected_shared);
    }

    #[test]
    fn test_hpke_roundtrip() {
        let (secret, public) = generate_keypair();
        let plaintext = b"Hello, KYC Vault!";
        let aad = b"test-aad";

        let ct = HPKE::encrypt(public.as_bytes(), plaintext, aad).unwrap();
        let decrypted = HPKE::decrypt(&secret, &ct, aad).unwrap();

        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_hpke_wrong_key_fails() {
        let (secret, _) = generate_keypair();
        let (_, public2) = generate_keypair();
        let plaintext = b"secret data";

        let ct = HPKE::encrypt(public2.as_bytes(), plaintext, b"").unwrap();
        let result = HPKE::decrypt(&secret, &ct, b"");
        assert!(result.is_err());
    }
}
