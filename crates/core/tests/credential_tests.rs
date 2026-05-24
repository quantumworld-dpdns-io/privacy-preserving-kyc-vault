use kyc_vault_core::credential::{CredentialStatus, Proof, VerifiableCredential};
use std::collections::HashMap;

#[test]
fn test_full_credential_lifecycle() {
    let mut claims = HashMap::new();
    claims.insert("name".into(), serde_json::json!("Alice"));
    claims.insert("age".into(), serde_json::json!(30));

    let mut vc = VerifiableCredential::new(
        "urn:uuid:lifecycle-1".into(),
        "did:example:issuer".into(),
        "did:example:alice".into(),
        claims,
    );

    assert_eq!(vc.credential_type.len(), 1);
    assert!(vc.credential_type.contains(&"VerifiableCredential".into()));
    assert!(vc.proof.is_none());
    assert!(vc.credential_status.is_none());

    let proof = Proof {
        proof_type: "Ed25519Signature2020".into(),
        created: "2025-01-01T00:00:00Z".into(),
        verification_method: "did:example:issuer#key-1".into(),
        proof_purpose: "assertionMethod".into(),
        proof_value: Some("zabc123".into()),
        jws: None,
        nonce: Some("nonce-1".into()),
        domain: Some("example.com".into()),
    };
    vc.add_proof(proof);

    assert!(vc.proof.is_some());
    assert_eq!(vc.proof.as_ref().unwrap().proof_type, "Ed25519Signature2020");

    let status = CredentialStatus {
        id: "urn:uuid:revocation-list-1".into(),
        status_type: "RevocationList2021".into(),
        revocation_list_index: Some(42),
        revocation_list_credential: Some("urn:uuid:list-cred".into()),
    };
    vc.set_status(status);

    assert!(vc.credential_status.is_some());
    assert_eq!(
        vc.credential_status.as_ref().unwrap().revocation_list_index,
        Some(42)
    );

    vc.add_type("AgeVerificationCredential".into());
    assert_eq!(vc.credential_type.len(), 2);
}

#[test]
fn test_credential_json_roundtrip_with_all_fields() {
    let mut claims = HashMap::new();
    claims.insert("name".into(), serde_json::json!("Bob"));
    claims.insert("country".into(), serde_json::json!("DE"));

    let mut vc = VerifiableCredential::new(
        "urn:uuid:roundtrip-1".into(),
        "did:example:gov".into(),
        "did:example:bob".into(),
        claims,
    );

    vc.set_expiration("2030-12-31T23:59:59Z".into());

    let json = vc.to_json().unwrap();
    let restored = VerifiableCredential::from_json(&json).unwrap();

    assert_eq!(restored.id, vc.id);
    assert_eq!(restored.issuer, vc.issuer);
    assert_eq!(restored.credential_subject.id, vc.credential_subject.id);
    assert_eq!(restored.expiration_date, vc.expiration_date);
    assert_eq!(
        restored.credential_subject.claims.get("name"),
        Some(&serde_json::json!("Bob"))
    );
}

#[test]
fn test_credential_expiration_edge_cases() {
    let mut claims = HashMap::new();

    let mut vc = VerifiableCredential::new(
        "urn:uuid:exp-1".into(),
        "did:example:issuer".into(),
        "did:example:sub".into(),
        claims,
    );

    assert!(!vc.is_expired());

    vc.set_expiration("3025-01-01T00:00:00Z".into());
    assert!(!vc.is_expired());

    vc.set_expiration("2020-01-01T00:00:00Z".into());
    assert!(vc.is_expired());
}

#[test]
fn test_credential_with_multiple_types() {
    let claims = HashMap::new();
    let mut vc = VerifiableCredential::new(
        "urn:uuid:types-1".into(),
        "did:example:issuer".into(),
        "did:example:sub".into(),
        claims,
    );

    vc.add_type("KYCVerificationCredential".into());
    vc.add_type("AgeVerificationCredential".into());

    assert_eq!(vc.credential_type.len(), 3);
    assert!(vc.credential_type.contains(&"AgeVerificationCredential".into()));
}

#[test]
fn test_credential_default_context() {
    let claims = HashMap::new();
    let vc = VerifiableCredential::new(
        "urn:uuid:ctx-1".into(),
        "did:example:issuer".into(),
        "did:example:sub".into(),
        claims,
    );

    assert_eq!(vc.context.len(), 2);
    assert!(vc.context[0].contains("w3.org/2018/credentials"));
}

#[test]
fn test_credential_proof_with_jws() {
    let mut claims = HashMap::new();
    claims.insert("score".into(), serde_json::json!(85));

    let mut vc = VerifiableCredential::new(
        "urn:uuid:jws-1".into(),
        "did:example:issuer".into(),
        "did:example:sub".into(),
        claims,
    );

    let proof = Proof {
        proof_type: "JsonWebSignature2020".into(),
        created: "2025-06-01T12:00:00Z".into(),
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
fn test_credential_multiple_claims() {
    let mut claims = HashMap::new();
    claims.insert("email".into(), serde_json::json!("alice@example.com"));
    claims.insert("phone".into(), serde_json::json!("+1-555-0100"));
    claims.insert("address".into(), serde_json::json!("123 Main St"));
    claims.insert("verified".into(), serde_json::json!(true));

    let vc = VerifiableCredential::new(
        "urn:uuid:claims-1".into(),
        "did:example:issuer".into(),
        "did:example:alice".into(),
        claims,
    );

    assert_eq!(vc.credential_subject.claims.len(), 4);
    assert_eq!(
        vc.credential_subject.claims.get("verified"),
        Some(&serde_json::json!(true))
    );
}

#[test]
fn test_credential_zero_length_claims() {
    let claims = HashMap::new();
    let vc = VerifiableCredential::new(
        "urn:uuid:empty-1".into(),
        "did:example:issuer".into(),
        "did:example:sub".into(),
        claims,
    );

    assert!(vc.credential_subject.claims.is_empty());
    assert_eq!(vc.credential_subject.id, "did:example:sub");
}
