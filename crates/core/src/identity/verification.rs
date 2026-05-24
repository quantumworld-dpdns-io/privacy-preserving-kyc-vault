use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationRequest {
    pub subject_id: String,
    pub claims: Vec<String>,
    pub issuer_did: Option<String>,
    pub schema_id: Option<String>,
    pub nonce: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiedClaim {
    pub claim: String,
    pub value: serde_json::Value,
    pub verified: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationProof {
    pub id: String,
    pub subject_id: String,
    pub verified_claims: Vec<VerifiedClaim>,
    pub proof_type: String,
    pub created: String,
    pub expires_at: Option<String>,
    pub signature: Option<String>,
    pub verification_method: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationEngine {
    pub trusted_issuers: Vec<String>,
    pub verifications: HashMap<String, VerificationProof>,
}

impl VerificationEngine {
    pub fn new() -> Self {
        Self {
            trusted_issuers: Vec::new(),
            verifications: HashMap::new(),
        }
    }

    pub fn add_trusted_issuer(&mut self, issuer_did: String) {
        if !self.trusted_issuers.contains(&issuer_did) {
            self.trusted_issuers.push(issuer_did);
        }
    }

    pub fn verify_claims(
        &mut self,
        request: &VerificationRequest,
        claims: HashMap<String, serde_json::Value>,
    ) -> VerificationProof {
        let verified_claims: Vec<VerifiedClaim> = request
            .claims
            .iter()
            .map(|claim| {
                let value = claims.get(claim);
                VerifiedClaim {
                    claim: claim.clone(),
                    value: value.cloned().unwrap_or(serde_json::Value::Null),
                    verified: value.is_some(),
                    source: request
                        .issuer_did
                        .clone()
                        .unwrap_or_else(|| "self".into()),
                }
            })
            .collect();

        let proof = VerificationProof {
            id: format!("urn:proof:{}", uuid::Uuid::new_v4()),
            subject_id: request.subject_id.clone(),
            verified_claims,
            proof_type: "Ed25519Signature2020".into(),
            created: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
            signature: None,
            verification_method: request
                .issuer_did
                .as_ref()
                .map(|d| format!("{}#key-0", d)),
        };

        let id = proof.id.clone();
        self.verifications.insert(id.clone(), proof.clone());
        proof
    }

    pub fn get_verification(&self, proof_id: &str) -> Option<&VerificationProof> {
        self.verifications.get(proof_id)
    }

    pub fn revoke_verification(&mut self, proof_id: &str) -> bool {
        self.verifications.remove(proof_id).is_some()
    }

    pub fn is_issuer_trusted(&self, issuer_did: &str) -> bool {
        self.trusted_issuers.contains(&issuer_did.to_string())
    }

    pub fn list_verifications_for_subject(&self, subject_id: &str) -> Vec<&VerificationProof> {
        self.verifications
            .values()
            .filter(|v| v.subject_id == subject_id)
            .collect()
    }
}

impl Default for VerificationEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_claims() {
        let mut engine = VerificationEngine::new();
        engine.add_trusted_issuer("did:example:issuer".into());

        let request = VerificationRequest {
            subject_id: "did:example:subject".into(),
            claims: vec!["age".into(), "nationality".into()],
            issuer_did: Some("did:example:issuer".into()),
            schema_id: None,
            nonce: None,
        };

        let mut claims = HashMap::new();
        claims.insert("age".into(), serde_json::json!(25));
        claims.insert("nationality".into(), serde_json::json!("US"));

        let proof = engine.verify_claims(&request, claims);
        assert_eq!(proof.verified_claims.len(), 2);
        assert!(proof.verified_claims.iter().all(|c| c.verified));
    }

    #[test]
    fn test_trusted_issuer() {
        let engine = VerificationEngine::new();
        assert!(!engine.is_issuer_trusted("did:example:unknown"));
    }

    #[test]
    fn test_revoke_verification() {
        let mut engine = VerificationEngine::new();
        let request = VerificationRequest {
            subject_id: "did:example:subject".into(),
            claims: vec!["name".into()],
            issuer_did: None,
            schema_id: None,
            nonce: None,
        };
        let mut claims = HashMap::new();
        claims.insert("name".into(), serde_json::json!("Alice"));
        let proof = engine.verify_claims(&request, claims);
        assert!(engine.revoke_verification(&proof.id));
        assert!(engine.get_verification(&proof.id).is_none());
    }
}
