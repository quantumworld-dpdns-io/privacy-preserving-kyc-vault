use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum GovernanceError {
    #[error("Issuer not trusted: {0}")]
    IssuerNotTrusted(String),
    #[error("Rule validation failed: {0}")]
    RuleValidationFailed(String),
    #[error("Registry full")]
    RegistryFull,
    #[error("Duplicate entry")]
    DuplicateEntry,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustRegistry {
    pub id: Uuid,
    pub name: String,
    pub issuers: Vec<TrustedIssuer>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustedIssuer {
    pub did: String,
    pub name: String,
    pub jurisdiction: String,
    pub added_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub attestation_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GovernanceRule {
    pub id: Uuid,
    pub rule_type: RuleType,
    pub parameters: serde_json::Value,
    pub enabled: bool,
    pub version: u32,
    pub valid_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleType {
    DidMethodPolicy,
    CredentialSchema,
    RevocationPolicy,
    KeyRotationPolicy,
    TrustFramework,
}

impl TrustRegistry {
    pub fn new(name: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            issuers: Vec::new(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    pub fn add_issuer(
        &mut self,
        did: &str,
        name: &str,
        jurisdiction: &str,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<(), GovernanceError> {
        if self.issuers.iter().any(|i| i.did == did) {
            return Err(GovernanceError::DuplicateEntry);
        }
        self.issuers.push(TrustedIssuer {
            did: did.to_string(),
            name: name.to_string(),
            jurisdiction: jurisdiction.to_string(),
            added_at: Utc::now(),
            expires_at,
            is_active: true,
            attestation_url: None,
        });
        self.updated_at = Utc::now();
        Ok(())
    }

    pub fn remove_issuer(&mut self, did: &str) {
        self.issuers.retain(|i| i.did != did);
        self.updated_at = Utc::now();
    }

    pub fn is_issuer_trusted(&self, did: &str) -> bool {
        self.issuers.iter().any(|i| {
            i.did == did
                && i.is_active
                && i.expires_at.map_or(true, |exp| Utc::now() < exp)
        })
    }

    pub fn count(&self) -> usize {
        self.issuers.len()
    }

    pub fn fingerprint(&self) -> String {
        let mut hasher = Sha256::new();
        for issuer in &self.issuers {
            hasher.update(issuer.did.as_bytes());
        }
        hex::encode(hasher.finalize())
    }
}

impl GovernanceRule {
    pub fn new(rule_type: RuleType, parameters: serde_json::Value) -> Self {
        Self {
            id: Uuid::new_v4(),
            rule_type,
            parameters,
            enabled: true,
            version: 1,
            valid_until: None,
        }
    }

    pub fn validate(&self) -> Result<(), GovernanceError> {
        if self.parameters.is_null() || self.parameters == serde_json::Value::Null {
            return Err(GovernanceError::RuleValidationFailed(
                "Parameters cannot be null".into(),
            ));
        }
        Ok(())
    }

    pub fn is_valid(&self) -> bool {
        self.enabled
            && self
                .valid_until
                .map_or(true, |exp| Utc::now() < exp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trust_registry_add_issuer() {
        let mut registry = TrustRegistry::new("Test Registry");
        registry.add_issuer("did:example:123", "Test Issuer", "US", None).unwrap();
        assert_eq!(registry.count(), 1);
        assert!(registry.is_issuer_trusted("did:example:123"));
    }

    #[test]
    fn test_trust_registry_duplicate() {
        let mut registry = TrustRegistry::new("Test");
        registry.add_issuer("did:example:123", "A", "US", None).unwrap();
        assert!(registry.add_issuer("did:example:123", "B", "US", None).is_err());
    }

    #[test]
    fn test_governance_rule_validation() {
        let rule = GovernanceRule::new(
            RuleType::DidMethodPolicy,
            serde_json::json!({"method": "key"}),
        );
        assert!(rule.validate().is_ok());
        assert!(rule.is_valid());
    }
}
