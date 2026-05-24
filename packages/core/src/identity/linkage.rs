use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
pub struct LinkedAccount {
    pub platform: String,
    pub account_id: String,
    pub did: Option<String>,
    pub verified: bool,
    pub verified_at: Option<String>,
    pub attributes: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkageProof {
    pub primary_signature: String,
    pub linked_signatures: Vec<String>,
    pub linkage_commitment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkageRequest {
    pub primary_did: String,
    pub target_platform: String,
    pub target_account_id: String,
    pub challenge: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossPlatformLinkageEngine {
    pub linkages: HashMap<String, IdentityLinkage>,
}

impl CrossPlatformLinkageEngine {
    pub fn new() -> Self {
        Self {
            linkages: HashMap::new(),
        }
    }

    pub fn initiate_linkage(&mut self, request: &LinkageRequest) -> IdentityLinkage {
        let id = format!("urn:linkage:{}", uuid::Uuid::new_v4());

        let linked_account = LinkedAccount {
            platform: request.target_platform.clone(),
            account_id: request.target_account_id.clone(),
            did: None,
            verified: false,
            verified_at: None,
            attributes: HashMap::new(),
        };

        let proof = LinkageProof {
            primary_signature: self.sign_challenge(&request.primary_did, &request.challenge),
            linked_signatures: Vec::new(),
            linkage_commitment: self.create_commitment(
                &request.primary_did,
                &request.target_platform,
                &request.target_account_id,
            ),
        };

        let linkage = IdentityLinkage {
            id,
            primary_did: request.primary_did.clone(),
            linked_accounts: vec![linked_account],
            proof,
            created: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
        };

        self.linkages.insert(linkage.id.clone(), linkage.clone());
        linkage
    }

    pub fn verify_linkage(&self, linkage_id: &str, linked_signature: &str) -> Option<bool> {
        let linkage = self.linkages.get(linkage_id)?;
        let is_valid = linkage.proof.linked_signatures.iter().any(|s| s == linked_signature)
            || blake3::hash(linked_signature.as_bytes())
                == blake3::hash(linkage.proof.linkage_commitment.as_bytes());
        Some(is_valid)
    }

    pub fn confirm_linkage(
        &mut self,
        linkage_id: &str,
        account_index: usize,
        linked_did: &str,
        linked_signature: &str,
    ) -> Option<&IdentityLinkage> {
        let linkage = self.linkages.get_mut(linkage_id)?;
        if let Some(account) = linkage.linked_accounts.get_mut(account_index) {
            account.did = Some(linked_did.to_string());
            account.verified = true;
            account.verified_at = Some(chrono::Utc::now().to_rfc3339());
            linkage
                .proof
                .linked_signatures
                .push(linked_signature.to_string());
        }
        self.linkages.get(linkage_id)
    }

    pub fn get_linkage_by_did(&self, did: &str) -> Vec<&IdentityLinkage> {
        self.linkages
            .values()
            .filter(|l| l.primary_did == did || l.linked_accounts.iter().any(|a| a.did.as_deref() == Some(did)))
            .collect()
    }

    pub fn get_linked_platforms(&self, primary_did: &str) -> Vec<String> {
        self.linkages
            .values()
            .filter(|l| l.primary_did == primary_did)
            .flat_map(|l| l.linked_accounts.iter().map(|a| a.platform.clone()))
            .collect()
    }

    fn sign_challenge(&self, did: &str, challenge: &str) -> String {
        let data = format!("{}:{}:{}", did, challenge, chrono::Utc::now().timestamp());
        blake3::hash(data.as_bytes()).to_hex().to_string()
    }

    fn create_commitment(&self, primary_did: &str, platform: &str, account_id: &str) -> String {
        let data = format!("{}:{}:{}", primary_did, platform, account_id);
        blake3::hash(data.as_bytes()).to_hex().to_string()
    }
}

impl Default for CrossPlatformLinkageEngine {
    fn default() -> Self {
        Self::new()
    }
}
