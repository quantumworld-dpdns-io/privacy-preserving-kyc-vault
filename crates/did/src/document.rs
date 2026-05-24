use crate::error::DIDError;
use crate::service::Service;
use crate::verification::VerificationMethod;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DIDDocument {
    #[serde(rename = "@context")]
    pub context: Vec<String>,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub controller: Option<Vec<String>>,
    #[serde(default)]
    pub also_known_as: Vec<String>,
    #[serde(default)]
    pub verification_method: Vec<VerificationMethod>,
    #[serde(default)]
    pub authentication: Vec<String>,
    #[serde(default)]
    pub assertion_method: Vec<String>,
    #[serde(default)]
    pub key_agreement: Vec<String>,
    #[serde(default)]
    pub capability_invocation: Vec<String>,
    #[serde(default)]
    pub capability_delegation: Vec<String>,
    #[serde(default)]
    pub service: Vec<Service>,
    #[serde(default)]
    pub created: Option<String>,
    #[serde(default)]
    pub updated: Option<String>,
    #[serde(default)]
    pub version_id: Option<String>,
    #[serde(default)]
    pub next_update: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl DIDDocument {
    pub fn new(id: String) -> Self {
        Self {
            context: vec![
                "https://www.w3.org/ns/did/v1".into(),
                "https://w3id.org/security/suites/ed25519-2020/v1".into(),
            ],
            id,
            controller: None,
            also_known_as: Vec::new(),
            verification_method: Vec::new(),
            authentication: Vec::new(),
            assertion_method: Vec::new(),
            key_agreement: Vec::new(),
            capability_invocation: Vec::new(),
            capability_delegation: Vec::new(),
            service: Vec::new(),
            created: None,
            updated: None,
            version_id: None,
            next_update: None,
            extra: HashMap::new(),
        }
    }

    pub fn add_verification_method(&mut self, method: VerificationMethod) {
        let method_id = method.id.clone();
        self.verification_method.push(method);
        self.authentication.push(method_id);
    }

    pub fn add_service(&mut self, service: Service) {
        self.service.push(service);
    }

    pub fn validate(&self) -> Result<(), DIDError> {
        if !self.id.starts_with("did:") {
            return Err(DIDError::InvalidDID(self.id.clone()));
        }

        for vm in &self.verification_method {
            if vm.controller.is_empty() {
                return Err(DIDError::InvalidVerificationMethod(
                    "Empty controller".into(),
                ));
            }
        }

        Ok(())
    }

    pub fn to_json(&self) -> Result<String, DIDError> {
        serde_json::to_string_pretty(self)
            .map_err(|e| DIDError::SerializationError(e.to_string()))
    }

    pub fn from_json(json: &str) -> Result<Self, DIDError> {
        serde_json::from_str(json).map_err(|e| DIDError::SerializationError(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_minimal_did_document() {
        let doc = DIDDocument::new("did:example:123".into());
        assert_eq!(doc.id, "did:example:123");
        assert!(doc.validate().is_ok());
    }

    #[test]
    fn test_did_document_with_key() {
        let mut doc = DIDDocument::new("did:key:z6Mkf".into());
        let vm = VerificationMethod::new_ed25519(
            "did:key:z6Mkf#z6Mkf".into(),
            "did:key:z6Mkf".into(),
            &[0u8; 32],
        );
        doc.add_verification_method(vm);
        assert_eq!(doc.verification_method.len(), 1);
        assert_eq!(doc.authentication.len(), 1);
    }

    #[test]
    fn test_did_document_validation_fails_bad_id() {
        let doc = DIDDocument::new("not-a-did".into());
        assert!(doc.validate().is_err());
    }

    #[test]
    fn test_json_roundtrip() {
        let doc = DIDDocument::new("did:example:123".into());
        let json = doc.to_json().unwrap();
        let restored = DIDDocument::from_json(&json).unwrap();
        assert_eq!(restored.id, doc.id);
    }
}
