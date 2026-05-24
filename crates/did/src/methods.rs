use crate::document::DIDDocument;
use crate::error::DIDError;
use crate::verification::VerificationMethod;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DIDMethod {
    Key,
    Web,
    Ethr,
    #[serde(untagged)]
    Other(String),
}

impl DIDMethod {
    pub fn as_str(&self) -> &str {
        match self {
            DIDMethod::Key => "key",
            DIDMethod::Web => "web",
            DIDMethod::Ethr => "ethr",
            DIDMethod::Other(s) => s,
        }
    }

    pub fn from_str(s: &str) -> Result<Self, DIDError> {
        match s {
            "key" => Ok(DIDMethod::Key),
            "web" => Ok(DIDMethod::Web),
            "ethr" => Ok(DIDMethod::Ethr),
            other => Ok(DIDMethod::Other(other.to_string())),
        }
    }
}

pub fn parse_did(did: &str) -> Result<(DIDMethod, String), DIDError> {
    let parts: Vec<&str> = did.splitn(3, ':').collect();
    if parts.len() < 3 || parts[0] != "did" {
        return Err(DIDError::InvalidDID(format!(
            "DID must start with 'did:', got {}",
            did
        )));
    }
    let method = DIDMethod::from_str(parts[1])?;
    let method_specific_id = parts[2..].join(":");
    Ok((method, method_specific_id))
}

pub fn resolve_did_key(method_specific_id: &str) -> Result<DIDDocument, DIDError> {
    use multibase::Base;
    use multikey::MultiKey;

    let did = format!("did:key:{}", method_specific_id);
    let decoded = multibase::decode(method_specific_id)
        .map_err(|e| DIDError::ResolutionError(format!("multibase decode: {}", e)))?;

    let multi_key = MultiKey::from_bytes(&decoded.1)
        .map_err(|e| DIDError::ResolutionError(format!("multikey parse: {}", e)))?;

    let mut doc = DIDDocument::new(did.clone());
    let vm_id = format!("{}#{}", did, method_specific_id);
    let vm = VerificationMethod {
        id: vm_id.clone(),
        verification_type: crate::verification::VerificationType::Ed25519VerificationKey2020,
        controller: did.clone(),
        public_key_multibase: Some(method_specific_id.to_string()),
        public_key_jwk: None,
        blockchain_account_id: None,
    };
    doc.verification_method.push(vm);
    doc.authentication.push(vm_id);
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_did_key() {
        let (method, msi) = parse_did("did:key:z6Mkf").unwrap();
        assert_eq!(method, DIDMethod::Key);
        assert_eq!(msi, "z6Mkf");
    }

    #[test]
    fn test_parse_did_web() {
        let (method, msi) = parse_did("did:web:example.com").unwrap();
        assert_eq!(method, DIDMethod::Web);
        assert_eq!(msi, "example.com");
    }

    #[test]
    fn test_parse_did_ethr() {
        let (method, msi) = parse_did("did:ethr:0xabc123").unwrap();
        assert_eq!(method, DIDMethod::Ethr);
        assert_eq!(msi, "0xabc123");
    }

    #[test]
    fn test_parse_invalid_did() {
        assert!(parse_did("invalid").is_err());
        assert!(parse_did("did:key").is_err());
    }
}
