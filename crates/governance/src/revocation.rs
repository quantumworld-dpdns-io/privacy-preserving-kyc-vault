use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum RevocationError {
    #[error("Credential not found: {0}")]
    CredentialNotFound(String),
    #[error("Already revoked: {0}")]
    AlreadyRevoked(String),
    #[error("Registry not found: {0}")]
    RegistryNotFound(Uuid),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RevocationReason {
    IssuanceError,
    Compromised,
    Superseded,
    Suspended,
    Expired,
    GovernanceAction,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationEntry {
    pub credential_id: String,
    pub issuer_did: String,
    pub revoked_at: DateTime<Utc>,
    pub reason: RevocationReason,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationRegistry {
    pub id: Uuid,
    pub name: String,
    pub entries: HashMap<String, RevocationEntry>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub merkle_root: Option<String>,
}

impl RevocationRegistry {
    pub fn new(name: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            entries: HashMap::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            merkle_root: None,
        }
    }

    pub fn revoke(
        &mut self,
        credential_id: &str,
        issuer_did: &str,
        reason: RevocationReason,
    ) -> Result<(), RevocationError> {
        if self.entries.contains_key(credential_id) {
            return Err(RevocationError::AlreadyRevoked(credential_id.into()));
        }
        self.entries.insert(
            credential_id.to_string(),
            RevocationEntry {
                credential_id: credential_id.to_string(),
                issuer_did: issuer_did.to_string(),
                revoked_at: Utc::now(),
                reason,
                signature: None,
            },
        );
        self.updated_at = Utc::now();
        self.recompute_merkle_root();
        Ok(())
    }

    pub fn is_revoked(&self, credential_id: &str) -> bool {
        self.entries.contains_key(credential_id)
    }

    pub fn get_reason(&self, credential_id: &str) -> Option<&RevocationReason> {
        self.entries
            .get(credential_id)
            .map(|e| &e.reason)
    }

    pub fn count(&self) -> usize {
        self.entries.len()
    }

    pub fn revoke_by_issuer(&mut self, issuer_did: &str) -> Vec<String> {
        let to_revoke: Vec<String> = self
            .entries
            .iter()
            .filter(|(_, e)| e.issuer_did == issuer_did)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &to_revoke {
            self.entries.remove(id);
        }
        self.updated_at = Utc::now();
        self.recompute_merkle_root();
        to_revoke
    }

    fn recompute_merkle_root(&mut self) {
        let mut hasher = Sha256::new();
        let mut keys: Vec<&String> = self.entries.keys().collect();
        keys.sort();
        for key in keys {
            hasher.update(key.as_bytes());
            if let Some(entry) = self.entries.get(*key) {
                hasher.update(entry.revoked_at.to_rfc3339().as_bytes());
            }
        }
        self.merkle_root = Some(hex::encode(hasher.finalize()));
    }

    pub fn verify_inclusion(&self, credential_id: &str) -> bool {
        self.entries.contains_key(credential_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_revoke_and_check() {
        let mut registry = RevocationRegistry::new("Test");
        registry
            .revoke("cred:123", "did:issuer:1", RevocationReason::Compromised)
            .unwrap();
        assert!(registry.is_revoked("cred:123"));
        assert_eq!(
            registry.get_reason("cred:123").unwrap(),
            &RevocationReason::Compromised
        );
    }

    #[test]
    fn test_double_revoke_fails() {
        let mut registry = RevocationRegistry::new("Test");
        registry
            .revoke("cred:123", "did:a", RevocationReason::Expired)
            .unwrap();
        assert!(
            registry
                .revoke("cred:123", "did:a", RevocationReason::Expired)
                .is_err()
        );
    }

    #[test]
    fn test_merkle_root() {
        let mut registry = RevocationRegistry::new("Test");
        assert!(registry.merkle_root.is_none());
        registry
            .revoke("cred:1", "did:a", RevocationReason::Compromised)
            .unwrap();
        assert!(registry.merkle_root.is_some());
    }
}
