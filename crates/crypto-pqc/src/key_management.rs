use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyMaterial {
    pub id: String,
    pub key_type: KeyType,
    pub algorithm: String,
    pub public_key: Vec<u8>,
    pub encrypted_private_key: Option<Vec<u8>>,
    pub key_wrap_nonce: Option<Vec<u8>>,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub status: KeyStatus,
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KeyType {
    Signing,
    Encryption,
    KeyAgreement,
    Authentication,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KeyStatus {
    Active,
    Expired,
    Revoked,
    Compromised,
}

pub struct KeyManager {
    keys: HashMap<String, KeyMaterial>,
    wrapping_key: Option<Vec<u8>>,
}

impl KeyManager {
    pub fn new() -> Self {
        Self {
            keys: HashMap::new(),
            wrapping_key: None,
        }
    }

    pub fn set_wrapping_key(&mut self, key: Vec<u8>) {
        self.wrapping_key = Some(key);
    }

    pub fn store(&mut self, key: KeyMaterial) {
        self.keys.insert(key.id.clone(), key);
    }

    pub fn get(&self, id: &str) -> Option<&KeyMaterial> {
        self.keys.get(id)
    }

    pub fn revoke(&mut self, id: &str) -> Result<(), String> {
        self.keys
            .get_mut(id)
            .ok_or_else(|| format!("Key not found: {}", id))
            .map(|k| k.status = KeyStatus::Revoked)
    }

    pub fn rotate(&mut self, old_id: &str, new_key: KeyMaterial) -> Result<(), String> {
        self.revoke(old_id)?;
        self.store(new_key);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_lifecycle() {
        let mut km = KeyManager::new();
        let key = KeyMaterial {
            id: "key-1".into(),
            key_type: KeyType::Signing,
            algorithm: "Ed25519".into(),
            public_key: vec![0u8; 32],
            encrypted_private_key: None,
            key_wrap_nonce: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
            status: KeyStatus::Active,
            tags: HashMap::new(),
        };

        km.store(key);
        assert!(km.get("key-1").is_some());

        km.revoke("key-1").unwrap();
        assert_eq!(km.get("key-1").unwrap().status, KeyStatus::Revoked);
    }
}
