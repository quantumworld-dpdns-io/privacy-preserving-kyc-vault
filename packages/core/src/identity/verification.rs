use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProofRequest {
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
    pub proof: Option<String>,
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
pub struct ProofGenerator {
    pub did: String,
    pub key_material: Option<String>,
}

impl ProofGenerator {
    pub fn new(did: String) -> Self {
        Self {
            did,
            key_material: None,
        }
    }

    pub fn with_key(mut self, key: String) -> Self {
        self.key_material = Some(key);
        self
    }

    pub fn generate_proof(
        &self,
        request: &ProofRequest,
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
                    proof: value.map(|_| self.create_claim_proof(claim)),
                    source: self.did.clone(),
                }
            })
            .collect();

        VerificationProof {
            id: format!("urn:proof:{}", uuid::Uuid::new_v4()),
            subject_id: request.subject_id.clone(),
            verified_claims,
            proof_type: "Ed25519Signature2020".into(),
            created: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
            signature: None,
            verification_method: Some(format!("{}#key-0", self.did)),
        }
    }

    fn create_claim_proof(&self, claim: &str) -> String {
        let data = format!("{}:{}:{}", self.did, claim, chrono::Utc::now().timestamp());
        blake3::hash(data.as_bytes()).to_hex().to_string()
    }
}
