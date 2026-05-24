use crate::crypto_pqc::{self, DilithiumWrapper, KyberWrapper};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use chrono::{Utc, Duration};

/// Quantum-safe credential issuance and verification
pub mod credential_issuance {
    use super::*;

    #[derive(Debug, Error)]
    pub enum CredentialError {
        #[error("Invalid credential format")]
        InvalidFormat,
        
        #[error("Credential expired")]
        Expired,
        
        #[error("Signature verification failed")]
        SignatureFailed,
        
        #[error("Quantum security parameters insufficient")]
        InsufficientSecurity,
        
        #[error("Issuer not trusted")]
        UntrustedIssuer,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct QuantumSafeCredential {
        pub version: String,
        pub issuer: String,
        pub subject: String,
        pub issued_at: i64, // Unix timestamp
        pub expires_at: i64, // Unix timestamp
        pub credential_subject: serde_json::Value,
        pub proof: CredentialProof,
        pub extensions: Option<serde_json::Value>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct CredentialProof {
        pub type_: String, // Using type_ to avoid keyword conflict
        pub created: i64,
        pub proof_purpose: String,
        pub verification_method: String,
        pub jws: String, // JSON Web Signature using quantum-safe algorithms
    }

    #[derive(Debug, Clone)]
    pub struct CredentialIssuer {
        pub did: String,
        pub kyber_wrapper: KyberWrapper,
        pub dilithium_wrapper: DilithiumWrapper,
        pub trusted_issuers: Vec<String>,
    }

    impl CredentialIssuer {
        pub fn new(did: String) -> Self {
            Self {
                did: did.clone(),
                kyber_wrapper: KyberWrapper::new(),
                dilithium_wrapper: DilithiumWrapper::new(),
                trusted_issuers: vec![did], // Self-trusted by default
            }
        }

        pub fn add_trusted_issuer(&mut self, issuer_did: String) {
            self.trusted_issuers.push(issuer_did);
        }

        pub fn issue_credential(
            &self,
            subject_did: &str,
            credential_subject: serde_json::Value,
            validity_days: i64,
        ) -> Result<QuantumSafeCredential, CredentialError> {
            let now = Utc::now().timestamp();
            let expires_at = now + (validity_days * 24 * 60 * 60);

            let mut credential = QuantumSafeCredential {
                version: "1.0".to_string(),
                issuer: self.did.clone(),
                subject: subject_did.to_string(),
                issued_at: now,
                expires_at,
                credential_subject,
                proof: CredentialProof {
                    type_: "JwsSignature2020".to_string(),
                    created: now,
                    proof_purpose: "assertionMethod".to_string(),
                    verification_method: format!("{}#key-1", self.did),
                    jws: String::new(), // Will be filled after signing
                },
                extensions: None,
            };

            // Create JWS payload (simplified - in reality would use proper JWS format)
            let payload = serde_json::to_string(&credential)
                .map_err(|_| CredentialError::InvalidFormat)?;
            
            // Sign using Dilithium (quantum-safe signature)
            let signature = self.dilithium_wrapper.sign(payload.as_bytes())
                .map_err(|_| CredentialError::SignatureFailed)?;
            
            // Create JWS (simplified)
            credential.proof.jws = base64::encode(signature);

            Ok(credential)
        }

        pub fn verify_credential(
            &self,
            credential: &QuantumSafeCredential,
        ) -> Result<(), CredentialError> {
            // Check expiration
            let now = Utc::now().timestamp();
            if credential.expires_at < now {
                return Err(CredentialError::Expired);
            }

            // Check issuer trust
            if !self.trusted_issuers.contains(&credential.issuer) {
                return Err(CredentialError::UntrustedIssuer);
            }

            // Verify signature
            // Create payload without proof field for verification
            let mut credential_for_verification = credential.clone();
            credential_for_verification.proof.jws = String::new();
            
            let payload = serde_json::to_string(&credential_for_verification)
                .map_err(|_| CredentialError::InvalidFormat)?;
            
            let signature = base64::decode(&credential.proof.jws)
                .map_err(|_| CredentialError::InvalidFormat)?;
            
            self.dilithium_wrapper.verify(payload.as_bytes(), &signature)
                .map_err(|_| CredentialError::SignatureFailed)?;

            Ok(())
        }

        pub fn create_presentation(
            &self,
            credential: &QuantumSafeCredential,
            challenge: &str,
        ) -> Result<VerifiablePresentation, CredentialError> {
            // Verify the credential first
            self.verify_credential(credential)?;

            // Create a presentation with zero-knowledge proof elements
            let presentation = VerifiablePresentation {
                context: vec![
                    "https://www.w3.org/2018/credentials/v1".to_string(),
                    "https://w3id.org/security/suites/ed25519-2020/v1".to_string(),
                ],
                id: Some(format!("urn:uuid:{}", uuid::Uuid::new_v4())),
                r#type: vec!["VerifiablePresentation".to_string()],
                verifiable_credential: vec![credential.clone()],
                proof: PresentationProof {
                    type_: "JwsSignature2020".to_string(),
                    created: Utc::now().timestamp(),
                    proof_purpose: "authentication".to_string(),
                    verification_method: format!("{}#key-1", self.did),
                    challenge: Some(challenge.to_string()),
                    jws: String::new(), // Will be filled after signing
                },
            };

            Ok(presentation)
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct VerifiablePresentation {
        pub context: Vec<String>,
        pub id: Option<String>,
        #[serde(rename = "type")]
        pub r#type: Vec<String>,
        pub verifiable_credential: Vec<QuantumSafeCredential>,
        pub proof: PresentationProof,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct PresentationProof {
        pub type_: String,
        pub created: i64,
        pub proof_purpose: String,
        pub verification_method: String,
        pub challenge: Option<String>,
        pub jws: String,
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use serde_json::json;

        #[test]
        fn test_issue_and_verify_credential() {
            let issuer = CredentialIssuer::new("did:example:issuer123".to_string());
            let subject_did = "did:example:subject456";
            
            let credential_subject = json!({
                "id": subject_did,
                "degree": {
                    "type": "BachelorDegree",
                    "name": "Bachelor of Science in Computer Science"
                }
            });
            
            let credential = issuer.issue_credential(subject_did, credential_subject, 365)
                .expect("Failed to issue credential");
            
            assert_eq!(credential.issuer, "did:example:issuer123");
            assert_eq!(credential.subject, subject_did);
            
            // Verify the credential
            issuer.verify_credential(&credential)
                .expect("Failed to verify credential");
        }

        #[test]
        fn test_expired_credential() {
            let issuer = CredentialIssuer::new("did:example:issuer123".to_string());
            let subject_did = "did:example:subject456";
            
            let credential_subject = json!({
                "id": subject_did,
                "degree": {
                    "type": "BachelorDegree",
                    "name": "Bachelor of Science in Computer Science"
                }
            });
            
            // Issue a credential that expires immediately
            let credential = issuer.issue_credential(subject_did, credential_subject, 0)
                .expect("Failed to issue credential");
            
            // Should fail verification due to expiration
            let result = issuer.verify_credential(&credential);
            assert!(result.is_err());
        }

        #[test]
        fn test_untrusted_issuer() {
            let issuer = CredentialIssuer::new("did:example:issuer123".to_string());
            let other_issuer = CredentialIssuer::new("did:example:other456".to_string());
            
            let credential_subject = json!({
                "id": "did:example:subject789",
                "degree": {
                    "type": "BachelorDegree",
                    "name": "Bachelor of Science in Computer Science"
                }
            });
            
            // Issue credential from untrusted issuer
            let credential = other_issuer.issue_credential(
                "did:example:subject789", 
                credential_subject, 
                365
            ).expect("Failed to issue credential");
            
            // Should fail verification due to untrusted issuer
            let result = issuer.verify_credential(&credential);
            assert!(result.is_err());
        }
    }
}