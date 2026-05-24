#![no_main]

use libfuzzer_sys::fuzz_target;
use serde::Deserialize;
use std::str::FromStr;

// ============================================================
// DID Document Parsing Fuzz Target
// ============================================================

#[derive(Debug, Deserialize)]
struct DidDocument {
    #[serde(rename = "@context")]
    context: Option<serde_json::Value>,
    id: String,
    #[serde(default)]
    also_known_as: Vec<String>,
    #[serde(default)]
    controller: Vec<String>,
    #[serde(default)]
    verification_method: Vec<VerificationMethod>,
    #[serde(default)]
    authentication: Vec<String>,
    #[serde(default)]
    assertion_method: Vec<String>,
    #[serde(default)]
    key_agreement: Vec<String>,
    #[serde(default)]
    capability_invocation: Vec<String>,
    #[serde(default)]
    capability_delegation: Vec<String>,
    #[serde(default)]
    service: Vec<Service>,
    #[serde(default)]
    proof: Option<Proof>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    updated: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VerificationMethod {
    id: String,
    #[serde(rename = "type")]
    type_: String,
    controller: String,
    #[serde(default)]
    public_key_multibase: Option<String>,
    #[serde(default)]
    public_key_jwk: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct Service {
    id: String,
    #[serde(rename = "type")]
    type_: String,
    #[serde(default)]
    service_endpoint: Option<String>,
    #[serde(default)]
    endpoints: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct Proof {
    #[serde(rename = "type")]
    type_: String,
    #[serde(default)]
    proof_purpose: Option<String>,
    #[serde(default)]
    verification_method: Option<String>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    proof_value: Option<String>,
    #[serde(default)]
    jws: Option<String>,
}

fn parse_did_document(data: &[u8]) -> Result<DidDocument, String> {
    let text = std::str::from_utf8(data).map_err(|e| format!("UTF-8 error: {}", e))?;
    let doc: DidDocument = serde_json::from_str(text).map_err(|e| format!("JSON parse error: {}", e))?;

    if !doc.id.starts_with("did:") {
        return Err("Invalid DID prefix".into());
    }

    let parts: Vec<&str> = doc.id.split(':').collect();
    if parts.len() < 3 {
        return Err("DID must have method and method-specific identifier".into());
    }

    for vm in &doc.verification_method {
        if !vm.id.contains('#') && !vm.id.starts_with("did:") {
            return Err(format!("Invalid verification method ID: {}", vm.id));
        }
    }

    Ok(doc)
}

fn serialize_credential(data: &[u8]) -> Result<serde_json::Value, String> {
    let value: serde_json::Value = serde_json::from_slice(data)
        .map_err(|e| format!("JSON parse error: {}", e))?;

    let obj = value.as_object().ok_or("Expected JSON object")?;

    if let Some(credential_subject) = obj.get("credentialSubject") {
        let subject = credential_subject.as_object().ok_or("credentialSubject must be object")?;
        if subject.is_empty() {
            return Err("credentialSubject must not be empty".into());
        }
    }

    if let Some(typ) = obj.get("type") {
        let types = typ.as_array().ok_or("type must be array")?;
        if types.is_empty() {
            return Err("type array must not be empty".into());
        }
    }

    Ok(value)
}

// Fuzz target 1: DID document parsing
fuzz_target!(|data: &[u8]| {
    if data.len() > 65536 {
        return;
    }

    let _ = parse_did_document(data);
});

// ============================================================
// Second fuzz target: Credential deserialization
// This would be compiled separately in a real setup
// ============================================================
#[cfg(fuzz_credential)]
mod credential_fuzz {
    use super::*;

    fuzz_target!(|data: &[u8]| {
        if data.len() > 131072 {
            return;
        }
        let _ = serialize_credential(data);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_did() {
        let valid = br#"{"id": "did:kyc:123456789abcdefghi"}"#;
        assert!(parse_did_document(valid).is_ok());
    }

    #[test]
    fn test_parse_invalid_did() {
        let invalid = br#"{"id": "invalid-did"}"#;
        assert!(parse_did_document(invalid).is_err());
    }

    #[test]
    fn test_serialize_valid_credential() {
        let valid = br#"{"credentialSubject": {"id": "did:kyc:123"}, "type": ["VerifiableCredential"]}"#;
        assert!(serialize_credential(valid).is_ok());
    }

    #[test]
    fn test_serialize_invalid_credential() {
        let invalid = br#"{"credentialSubject": {}, "type": []}"#;
        assert!(serialize_credential(invalid).is_err());
    }
}
