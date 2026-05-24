use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedAccount {
    pub platform: String,
    pub account_id: String,
    pub did: Option<String>,
    pub verified: bool,
    pub verified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkageProof {
    pub primary_signature: String,
    pub linked_signature: Option<String>,
    pub commitment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityLinkage {
    pub id: String,
    pub primary_did: String,
    pub linked_accounts: Vec<LinkedAccount>,
    pub proof: LinkageProof,
    pub created: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformLinkage {
    pub id: String,
    pub platform_a: String,
    pub platform_b: String,
    pub shared_attributes: Vec<String>,
    pub linkage_proof: LinkageProof,
    pub established_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkageEngine {
    pub identity_linkages: HashMap<String, IdentityLinkage>,
    pub platform_linkages: HashMap<String, PlatformLinkage>,
}

impl LinkageEngine {
    pub fn new() -> Self {
        Self {
            identity_linkages: HashMap::new(),
            platform_linkages: HashMap::new(),
        }
    }

    pub fn create_identity_linkage(
        &mut self,
        primary_did: String,
        platform: String,
        account_id: String,
    ) -> IdentityLinkage {
        let id = format!("urn:linkage:{}", uuid::Uuid::new_v4());

        let linked_account = LinkedAccount {
            platform,
            account_id,
            did: None,
            verified: false,
            verified_at: None,
        };

        let proof = LinkageProof {
            primary_signature: self.create_signature(&primary_did),
            linked_signature: None,
            commitment: self.create_commitment(&primary_did),
        };

        let linkage = IdentityLinkage {
            id: id.clone(),
            primary_did,
            linked_accounts: vec![linked_account],
            proof,
            created: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
        };

        self.identity_linkages.insert(id, linkage.clone());
        linkage
    }

    pub fn verify_identity_linkage(
        &self,
        linkage_id: &str,
    ) -> Option<bool> {
        let linkage = self.identity_linkages.get(linkage_id)?;
        Some(linkage.linked_accounts.iter().all(|a| a.verified))
    }

    pub fn confirm_linkage(
        &mut self,
        linkage_id: &str,
        account_index: usize,
        linked_did: &str,
    ) -> Option<&IdentityLinkage> {
        let linkage = self.identity_linkages.get_mut(linkage_id)?;
        if let Some(account) = linkage.linked_accounts.get_mut(account_index) {
            account.did = Some(linked_did.to_string());
            account.verified = true;
            account.verified_at = Some(chrono::Utc::now().to_rfc3339());
        }
        self.identity_linkages.get(linkage_id)
    }

    pub fn create_platform_linkage(
        &mut self,
        platform_a: String,
        platform_b: String,
        shared_attributes: Vec<String>,
    ) -> PlatformLinkage {
        let id = format!("urn:platform-linkage:{}", uuid::Uuid::new_v4());

        let proof = LinkageProof {
            primary_signature: self.create_signature(&platform_a),
            linked_signature: None,
            commitment: self.create_commitment(&format!("{}:{}", platform_a, platform_b)),
        };

        let linkage = PlatformLinkage {
            id: id.clone(),
            platform_a,
            platform_b,
            shared_attributes,
            linkage_proof: proof,
            established_at: chrono::Utc::now().to_rfc3339(),
        };

        self.platform_linkages.insert(id, linkage.clone());
        linkage
    }

    pub fn get_linkages_for_did(&self, did: &str) -> Vec<&IdentityLinkage> {
        self.identity_linkages
            .values()
            .filter(|l| l.primary_did == did || l.linked_accounts.iter().any(|a| a.did.as_deref() == Some(did)))
            .collect()
    }

    pub fn get_platform_linkages(&self, platform: &str) -> Vec<&PlatformLinkage> {
        self.platform_linkages
            .values()
            .filter(|l| l.platform_a == platform || l.platform_b == platform)
            .collect()
    }

    fn create_signature(&self, input: &str) -> String {
        let data = format!("{}:{}", input, chrono::Utc::now().timestamp());
        blake3::hash(data.as_bytes()).to_hex().to_string()
    }

    fn create_commitment(&self, input: &str) -> String {
        blake3::hash(input.as_bytes()).to_hex().to_string()
    }
}

impl Default for LinkageEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_identity_linkage() {
        let mut engine = LinkageEngine::new();
        let linkage = engine.create_identity_linkage(
            "did:example:primary".into(),
            "github".into(),
            "user123".into(),
        );
        assert_eq!(linkage.primary_did, "did:example:primary");
        assert_eq!(linkage.linked_accounts.len(), 1);
        assert!(!linkage.linked_accounts[0].verified);
    }

    #[test]
    fn test_confirm_linkage() {
        let mut engine = LinkageEngine::new();
        let linkage = engine.create_identity_linkage(
            "did:example:primary".into(),
            "twitter".into(),
            "user456".into(),
        );
        let confirmed = engine.confirm_linkage(&linkage.id, 0, "did:example:secondary");
        assert!(confirmed.is_some());
        assert!(confirmed.unwrap().linked_accounts[0].verified);
    }

    #[test]
    fn test_platform_linkage() {
        let mut engine = LinkageEngine::new();
        let pl = engine.create_platform_linkage(
            "platform_a".into(),
            "platform_b".into(),
            vec!["email".into(), "phone".into()],
        );
        assert_eq!(pl.platform_a, "platform_a");
        assert_eq!(pl.shared_attributes.len(), 2);
    }

    #[test]
    fn test_get_linkages_for_did() {
        let mut engine = LinkageEngine::new();
        let linkage = engine.create_identity_linkage(
            "did:example:user".into(),
            "discord".into(),
            "user#1234".into(),
        );
        engine.confirm_linkage(&linkage.id, 0, "did:example:linked");

        let results = engine.get_linkages_for_did("did:example:linked");
        assert_eq!(results.len(), 1);
    }
}
