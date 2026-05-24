use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiableCredential {
    #[serde(rename = "@context")]
    pub context: Vec<String>,
    pub id: String,
    #[serde(rename = "type")]
    pub credential_type: Vec<String>,
    pub issuer: String,
    pub issuance_date: String,
    pub expiration_date: Option<String>,
    pub credential_subject: CredentialSubject,
    pub credential_status: Option<CredentialStatus>,
    pub proof: Option<Proof>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialSubject {
    pub id: String,
    #[serde(flatten)]
    pub claims: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialStatus {
    pub id: String,
    #[serde(rename = "type")]
    pub status_type: String,
    pub revocation_list_index: Option<u64>,
    pub revocation_list_credential: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proof {
    #[serde(rename = "type")]
    pub proof_type: String,
    pub created: String,
    pub verification_method: String,
    pub proof_purpose: String,
    pub proof_value: Option<String>,
    pub jws: Option<String>,
    pub nonce: Option<String>,
    pub domain: Option<String>,
}

impl VerifiableCredential {
    pub fn new(
        id: String,
        issuer: String,
        subject_id: String,
        claims: HashMap<String, serde_json::Value>,
    ) -> Self {
        Self {
            context: vec![
                "https://www.w3.org/2018/credentials/v1".into(),
                "https://www.w3.org/2018/credentials/examples/v1".into(),
            ],
            id,
            credential_type: vec!["VerifiableCredential".into()],
            issuer,
            issuance_date: chrono::Utc::now().to_rfc3339(),
            expiration_date: None,
            credential_subject: CredentialSubject {
                id: subject_id,
                claims,
            },
            credential_status: None,
            proof: None,
        }
    }

    pub fn add_proof(&mut self, proof: Proof) {
        self.proof = Some(proof);
    }

    pub fn set_status(&mut self, status: CredentialStatus) {
        self.credential_status = Some(status);
    }

    pub fn add_type(&mut self, credential_type: String) {
        self.credential_type.push(credential_type);
    }

    pub fn set_expiration(&mut self, expiration: String) {
        self.expiration_date = Some(expiration);
    }

    pub fn is_expired(&self) -> bool {
        if let Some(ref exp) = self.expiration_date {
            if let Ok(exp_time) = chrono::DateTime::parse_from_rfc3339(exp) {
                return chrono::Utc::now() > exp_time;
            }
        }
        false
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiablePresentation {
    #[serde(rename = "@context")]
    pub context: Vec<String>,
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub presentation_type: Vec<String>,
    pub holder: Option<String>,
    pub verifiable_credential: Vec<VerifiableCredential>,
    pub proof: Option<Proof>,
}

impl VerifiablePresentation {
    pub fn new(credentials: Vec<VerifiableCredential>) -> Self {
        Self {
            context: vec!["https://www.w3.org/2018/credentials/v1".into()],
            id: None,
            presentation_type: vec!["VerifiablePresentation".into()],
            holder: None,
            verifiable_credential: credentials,
            proof: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_credential() {
        let mut claims = HashMap::new();
        claims.insert("age".into(), serde_json::json!(25));
        claims.insert("nationality".into(), serde_json::json!("US"));

        let vc = VerifiableCredential::new(
            "urn:uuid:abc-123".into(),
            "did:example:issuer".into(),
            "did:example:subject".into(),
            claims,
        );

        assert!(vc.id.contains("abc-123"));
        assert!(!vc.is_expired());
    }

    #[test]
    fn test_credential_expiry() {
        let mut claims = HashMap::new();
        claims.insert("age".into(), serde_json::json!(25));

        let mut vc = VerifiableCredential::new(
            "urn:uuid:abc".into(),
            "did:example:issuer".into(),
            "did:example:subject".into(),
            claims,
        );

        let past = "2020-01-01T00:00:00Z".to_string();
        vc.set_expiration(past);
        assert!(vc.is_expired());
    }

    #[test]
    fn test_json_roundtrip() {
        let mut claims = HashMap::new();
        claims.insert("name".into(), serde_json::json!("Alice"));

        let vc = VerifiableCredential::new(
            "urn:uuid:abc".into(),
            "did:example:issuer".into(),
            "did:example:alice".into(),
            claims,
        );

        let json = vc.to_json().unwrap();
        let restored = VerifiableCredential::from_json(&json).unwrap();
        assert_eq!(restored.issuer, vc.issuer);
        assert_eq!(restored.credential_subject.id, vc.credential_subject.id);
    }

    #[test]
    fn test_verifiable_presentation() {
        let claims = HashMap::new();
        let vc = VerifiableCredential::new(
            "urn:uuid:1".into(),
            "did:example:issuer".into(),
            "did:example:subject".into(),
            claims,
        );

        let vp = VerifiablePresentation::new(vec![vc]);
        assert_eq!(vp.verifiable_credential.len(), 1);
    }
}
