use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConfig {
    pub id: String,
    pub name: String,
    pub api_key_hash: String,
    pub webhook_url: Option<String>,
    pub webhook_secret: Option<String>,
    pub allowed_credential_types: Vec<String>,
    pub kyc_templates: Vec<String>,
    pub consent_required: bool,
    pub auto_approve: bool,
    pub status: PlatformStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PlatformStatus {
    Active,
    Suspended,
    PendingVerification,
    Deactivated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentToken {
    pub id: String,
    pub platform_id: String,
    pub subject_did: String,
    pub scope: Vec<String>,
    pub issued_at: String,
    pub expires_at: String,
    pub signature: Option<String>,
}

impl PlatformConfig {
    pub fn new(id: String, name: String, api_key: &str) -> Self {
        use sha2::{Digest, Sha256};
        let hash = hex::encode(Sha256::digest(api_key.as_bytes()));

        Self {
            id,
            name,
            api_key_hash: hash,
            webhook_url: None,
            webhook_secret: None,
            allowed_credential_types: vec!["AgeVerificationCredential".into()],
            kyc_templates: vec!["tier-2-basic".into()],
            consent_required: true,
            auto_approve: false,
            status: PlatformStatus::PendingVerification,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn verify_api_key(&self, api_key: &str) -> bool {
        use sha2::{Digest, Sha256};
        let hash = hex::encode(Sha256::digest(api_key.as_bytes()));
        hash == self.api_key_hash
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_platform_config() {
        let platform = PlatformConfig::new("plat-1".into(), "Test Platform".into(), "sk_test_123");
        assert_eq!(platform.status, PlatformStatus::PendingVerification);
        assert!(platform.verify_api_key("sk_test_123"));
        assert!(!platform.verify_api_key("wrong_key"));
    }
}
