use kyc_vault_core::credential::{CredentialStatus, Proof, VerifiableCredential};
use std::collections::HashMap;

fn make_vc(id: &str, subject: &str) -> VerifiableCredential {
    let mut claims = HashMap::new();
    claims.insert("name".into(), serde_json::json!("Alice"));
    claims.insert("age".into(), serde_json::json!(30));
    VerifiableCredential::new(
        id.into(),
        "did:example:issuer".into(),
        subject.into(),
        claims,
    )
}

#[test]
fn test_vc_creation_with_multiple_claims() {
    let mut claims = HashMap::new();
    claims.insert("name".into(), serde_json::json!("Bob"));
    claims.insert("age".into(), serde_json::json!(25));
    claims.insert("country".into(), serde_json::json!("US"));
    claims.insert("verified_at".into(), serde_json::json!("2025-01-01"));

    let vc = VerifiableCredential::new(
        "urn:uuid:abc".into(),
        "did:example:issuer".into(),
        "did:example:bob".into(),
        claims,
    );

    assert_eq!(vc.id, "urn:uuid:abc");
    assert_eq!(vc.issuer, "did:example:issuer");
    assert_eq!(vc.credential_type, vec!["VerifiableCredential"]);
    assert_eq!(vc.credential_subject.claims.len(), 4);
    assert_eq!(
        vc.credential_subject.claims.get("name"),
        Some(&serde_json::json!("Bob"))
    );
}

#[test]
fn test_vc_json_serialization_roundtrip() {
    let vc = make_vc("urn:uuid:json-1", "did:example:alice");
    let json = vc.to_json().unwrap();
    assert!(json.contains("VerifiableCredential"));
    assert!(json.contains("did:example:alice"));

    let restored: VerifiableCredential = VerifiableCredential::from_json(&json).unwrap();
    assert_eq!(restored.id, vc.id);
    assert_eq!(restored.issuer, vc.issuer);
    assert_eq!(restored.credential_subject.id, vc.credential_subject.id);
}

#[test]
fn test_add_proof_to_credential() {
    let mut vc = make_vc("urn:uuid:proof-1", "did:example:carol");
    assert!(vc.proof.is_none());

    let proof = Proof {
        proof_type: "Ed25519Signature2020".into(),
        created: "2025-06-01T12:00:00Z".into(),
        verification_method: "did:example:issuer#key-1".into(),
        proof_purpose: "assertionMethod".into(),
        proof_value: Some("zabc123signature".into()),
        jws: None,
        nonce: Some("nonce-xyz".into()),
        domain: Some("kyc.example.com".into()),
    };
    vc.add_proof(proof);

    assert!(vc.proof.is_some());
    let p = vc.proof.as_ref().unwrap();
    assert_eq!(p.proof_type, "Ed25519Signature2020");
    assert_eq!(p.proof_purpose, "assertionMethod");
    assert_eq!(p.nonce, Some("nonce-xyz".into()));
    assert_eq!(p.domain, Some("kyc.example.com".into()));
}

#[test]
fn test_add_proof_with_jws() {
    let mut vc = make_vc("urn:uuid:jws-proof", "did:example:dave");
    let proof = Proof {
        proof_type: "JsonWebSignature2020".into(),
        created: "2025-06-15T00:00:00Z".into(),
        verification_method: "did:example:issuer#jwks".into(),
        proof_purpose: "assertionMethod".into(),
        proof_value: None,
        jws: Some("eyJhbGciOiJFZERTQSJ9..dGVzdA".into()),
        nonce: None,
        domain: None,
    };
    vc.add_proof(proof);

    assert!(vc.proof.as_ref().unwrap().jws.is_some());
    assert!(vc.proof.as_ref().unwrap().proof_value.is_none());
}

#[test]
fn test_credential_expiry_check() {
    let mut vc = make_vc("urn:uuid:exp-1", "did:example:eve");
    assert!(!vc.is_expired());

    vc.set_expiration("2020-01-01T00:00:00Z".into());
    assert!(vc.is_expired());

    vc.set_expiration("3025-01-01T00:00:00Z".into());
    assert!(!vc.is_expired());
}

#[test]
fn test_credential_expiry_no_expiration_set() {
    let vc = make_vc("urn:uuid:no-exp", "did:example:frank");
    assert!(!vc.is_expired());
}

#[test]
fn test_credential_status_management() {
    let mut vc = make_vc("urn:uuid:status-1", "did:example:grace");
    assert!(vc.credential_status.is_none());

    let status = CredentialStatus {
        id: "urn:uuid:rev-list-1".into(),
        status_type: "RevocationList2021".into(),
        revocation_list_index: Some(7),
        revocation_list_credential: Some("urn:uuid:list-cred".into()),
    };
    vc.set_status(status);

    assert!(vc.credential_status.is_some());
    let s = vc.credential_status.as_ref().unwrap();
    assert_eq!(s.revocation_list_index, Some(7));
    assert_eq!(s.status_type, "RevocationList2021");
}

#[test]
fn test_credential_add_multiple_types() {
    let mut vc = make_vc("urn:uuid:types-1", "did:example:heidi");
    assert_eq!(vc.credential_type.len(), 1);

    vc.add_type("KYCVerificationCredential".into());
    vc.add_type("AgeVerificationCredential".into());

    assert_eq!(vc.credential_type.len(), 3);
    assert!(vc.credential_type.contains(&"AgeVerificationCredential".into()));
}

#[test]
fn test_credential_serialization_preserves_all_fields() {
    let mut claims = HashMap::new();
    claims.insert("email".into(), serde_json::json!("alice@example.com"));
    claims.insert("phone".into(), serde_json::json!("+1-555-0100"));
    claims.insert("address".into(), serde_json::json!("123 Main St"));

    let mut vc = VerifiableCredential::new(
        "urn:uuid:full-1".into(),
        "did:example:issuer".into(),
        "did:example:alice".into(),
        claims,
    );

    vc.set_expiration("2030-12-31T23:59:59Z".into());
    vc.add_type("KYCVerificationCredential".into());

    let proof = Proof {
        proof_type: "Ed25519Signature2020".into(),
        created: "2025-06-01T00:00:00Z".into(),
        verification_method: "did:example:issuer#key-1".into(),
        proof_purpose: "assertionMethod".into(),
        proof_value: Some("zsignature".into()),
        jws: None,
        nonce: None,
        domain: None,
    };
    vc.add_proof(proof);

    let json = vc.to_json().unwrap();
    let restored = VerifiableCredential::from_json(&json).unwrap();

    assert_eq!(restored.id, vc.id);
    assert_eq!(restored.issuer, vc.issuer);
    assert_eq!(restored.credential_subject.id, vc.credential_subject.id);
    assert_eq!(restored.expiration_date, vc.expiration_date);
    assert_eq!(restored.credential_type.len(), 2);
    assert!(restored.proof.is_some());
}
