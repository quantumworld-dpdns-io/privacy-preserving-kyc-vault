use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SealedData {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub key_id: String,
    pub key_derivation_info: KeyDerivationInfo,
    pub iv: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyDerivationInfo {
    pub algorithm: String,
    pub salt: Vec<u8>,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeBoundKey {
    pub key_id: String,
    pub enc_key: Vec<u8>,
    pub policy: KeyPolicy,
    pub sealed_key: Option<SealedData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyPolicy {
    pub allowed_functions: Vec<String>,
    pub use_count: u64,
    pub max_uses: u64,
    pub ttl_seconds: u64,
    pub created_at: u64,
    pub exportable: bool,
}

pub struct SealingEngine {
    master_key: Vec<u8>,
    key_id_prefix: String,
    key_counter: u64,
}

impl SealingEngine {
    pub fn new(master_key: &[u8], key_id_prefix: &str) -> Self {
        Self {
            master_key: master_key.to_vec(),
            key_id_prefix: key_id_prefix.to_owned(),
            key_counter: 0,
        }
    }

    pub fn derive_tee_key(
        &mut self,
        context: &str,
        policy: KeyPolicy,
    ) -> Result<TeeBoundKey> {
        self.key_counter += 1;
        let key_id = format!("{}/{}/{}", self.key_id_prefix, context, self.key_counter);

        let salt: [u8; 32] = OsRng.gen();
        let mut hasher = Sha256::new();
        hasher.update(&self.master_key);
        hasher.update(&salt);
        hasher.update(context.as_bytes());
        let derived_key = hasher.finalize().to_vec();

        let sealed = if !policy.exportable {
            let nonce: [u8; 12] = OsRng.gen();
            let cipher = Aes256Gcm::new_from_slice(&self.master_key)
                .context("failed to create AES-256-GCM cipher")?;
            let ciphertext = cipher
                .encrypt(Nonce::from_slice(&nonce), derived_key.as_slice())
                .context("failed to seal derived key")?;
            Some(SealedData {
                ciphertext,
                nonce: nonce.to_vec(),
                key_id: key_id.clone(),
                key_derivation_info: KeyDerivationInfo {
                    algorithm: "HKDF-SHA256".into(),
                    salt: salt.to_vec(),
                    context: context.to_owned(),
                },
                iv: nonce.to_vec(),
            })
        } else {
            None
        };

        info!(key_id = %key_id, exportable = policy.exportable, "tee-bound key derived");

        Ok(TeeBoundKey {
            key_id,
            enc_key: derived_key,
            policy,
            sealed_key: sealed,
        })
    }

    pub fn seal(&self, plaintext: &[u8], aad: &[u8], key: &TeeBoundKey) -> Result<SealedData> {
        let nonce: [u8; 12] = OsRng.gen();
        let cipher = Aes256Gcm::new_from_slice(&key.enc_key)
            .context("failed to create cipher from TEE key")?;

        let mut ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext)
            .context("sealing operation failed")?;

        let combined = [ciphertext.as_slice(), aad].concat();
        let integrity_tag = Sha256::digest(&combined);

        ciphertext.extend_from_slice(&integrity_tag);

        info!(
            key_id = %key.key_id,
            plaintext_len = plaintext.len(),
            "data sealed with tee-bound key"
        );

        Ok(SealedData {
            ciphertext,
            nonce: nonce.to_vec(),
            key_id: key.key_id.clone(),
            key_derivation_info: KeyDerivationInfo {
                algorithm: "AES-256-GCM".into(),
                salt: Vec::new(),
                context: String::new(),
            },
            iv: nonce.to_vec(),
        })
    }

    pub fn unseal(&self, sealed: &SealedData, aad: &[u8], key: &TeeBoundKey) -> Result<Vec<u8>> {
        let cipher = Aes256Gcm::new_from_slice(&key.enc_key)
            .context("failed to create cipher from TEE key")?;

        let ciphertext_len = sealed.ciphertext.len().saturating_sub(32);
        if ciphertext_len == 0 {
            anyhow::bail!("sealed data too short to contain integrity tag");
        }

        let (encrypted_data, stored_tag) = sealed.ciphertext.split_at(ciphertext_len);

        let combined = [encrypted_data, aad].concat();
        let computed_tag = Sha256::digest(&combined);

        if computed_tag.as_slice() != stored_tag {
            anyhow::bail!("integrity check failed: sealed data may be tampered");
        }

        let plaintext = cipher
            .decrypt(Nonce::from_slice(&sealed.nonce), encrypted_data)
            .context("unsealing operation failed")?;

        info!(
            key_id = %sealed.key_id,
            plaintext_len = plaintext.len(),
            "data unsealed successfully"
        );

        Ok(plaintext)
    }

    pub fn rotate_key(&mut self, old_key: &TeeBoundKey, new_policy: KeyPolicy) -> Result<TeeBoundKey> {
        let mut new_key = self.derive_tee_key("rotated", new_policy)?;

        if let Some(ref sealed) = old_key.sealed_key {
            let plaintext = self.unseal(sealed, b"rotate", old_key)?;
            new_key.enc_key = plaintext;
        }

        info!(old_id = %old_key.key_id, new_id = %new_key.key_id, "tee key rotated");
        Ok(new_key)
    }

    pub fn generate_master_key() -> Vec<u8> {
        let mut key = vec![0u8; 32];
        use rand::RngCore;
        rand::rngs::OsRng.fill_bytes(&mut key);
        key
    }

    pub fn in_memory_seal(plaintext: &[u8]) -> Result<SealedData> {
        let key = generate_session_key();
        let nonce: [u8; 12] = OsRng.gen();
        let cipher = Aes256Gcm::new_from_slice(&key)
            .context("failed to create session cipher")?;
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext)
            .context("in-memory seal failed")?;

        Ok(SealedData {
            ciphertext,
            nonce: nonce.to_vec(),
            key_id: "session".into(),
            key_derivation_info: KeyDerivationInfo {
                algorithm: "AES-256-GCM-SESSION".into(),
                salt: vec![],
                context: "in-memory".into(),
            },
            iv: nonce.to_vec(),
        })
    }

    pub fn in_memory_unseal(sealed: &SealedData) -> Result<Vec<u8>> {
        let key = generate_session_key();
        let cipher = Aes256Gcm::new_from_slice(&key)
            .context("failed to create session cipher")?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&sealed.nonce), sealed.ciphertext.as_slice())
            .context("in-memory unseal failed")?;
        Ok(plaintext)
    }
}

fn generate_session_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut key);
    key
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_setup() -> (SealingEngine, KeyPolicy) {
        let mk = SealingEngine::generate_master_key();
        let engine = SealingEngine::new(&mk, "test/kyc-vault");
        let policy = KeyPolicy {
            allowed_functions: vec!["credential_process".into()],
            use_count: 0,
            max_uses: 100,
            ttl_seconds: 3600,
            created_at: 0,
            exportable: false,
        };
        (engine, policy)
    }

    #[test]
    fn test_seal_unseal_roundtrip() {
        let (mut engine, policy) = test_setup();
        let key = engine.derive_tee_key("credential_process", policy).unwrap();
        let plaintext = b"sensitive-kyc-data";
        let aad = b"credential-processor";
        let sealed = engine.seal(plaintext, aad, &key).unwrap();
        let unsealed = engine.unseal(&sealed, aad, &key).unwrap();
        assert_eq!(unsealed, plaintext);
    }

    #[test]
    fn test_integrity_check_fails_on_tamper() {
        let (mut engine, policy) = test_setup();
        let key = engine.derive_tee_key("test", policy).unwrap();
        let sealed = engine.seal(b"data", b"aad", &key).unwrap();
        let mut tampered = sealed.clone();
        tampered.ciphertext[0] ^= 0xff;
        assert!(engine.unseal(&tampered, b"aad", &key).is_err());
    }

    #[test]
    fn test_aad_mismatch_fails() {
        let (mut engine, policy) = test_setup();
        let key = engine.derive_tee_key("test", policy).unwrap();
        let sealed = engine.seal(b"data", b"correct-aad", &key).unwrap();
        assert!(engine.unseal(&sealed, b"wrong-aad", &key).is_err());
    }

    #[test]
    fn test_exportable_key_not_sealed() {
        let mk = SealingEngine::generate_master_key();
        let mut engine = SealingEngine::new(&mk, "test");
        let policy = KeyPolicy {
            exportable: true,
            ..KeyPolicy {
                allowed_functions: vec![],
                use_count: 0,
                max_uses: 10,
                ttl_seconds: 3600,
                created_at: 0,
                exportable: true,
            }
        };
        let key = engine.derive_tee_key("exportable-test", policy).unwrap();
        assert!(key.sealed_key.is_none());
    }

    #[test]
    fn test_key_rotation() {
        let (mut engine, policy) = test_setup();
        let old_key = engine.derive_tee_key("rotate-test", policy).unwrap();
        let new_policy = KeyPolicy {
            max_uses: 200,
            ..KeyPolicy {
                allowed_functions: vec!["credential_process".into()],
                use_count: 0,
                max_uses: 200,
                ttl_seconds: 7200,
                created_at: 0,
                exportable: false,
            }
        };
        let rotated = engine.rotate_key(&old_key, new_policy).unwrap();
        assert_ne!(old_key.key_id, rotated.key_id);
    }

    #[test]
    fn test_in_memory_seal_unseal() {
        let data = b"ephemeral-sensitive-data";
        let sealed = SealingEngine::in_memory_seal(data).unwrap();
        let unsealed = SealingEngine::in_memory_unseal(&sealed).unwrap();
        assert_eq!(unsealed, data);
    }
}
