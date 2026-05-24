use kyc_vault_core::credential::{Proof, VerifiableCredential, VerifiablePresentation};
use kyc_vault_core::presentation::{CredentialQuery, PresentationQuery, PresentationRequest};
use std::collections::HashMap;

fn make_credential(id: &str, subject: &str) -> VerifiableCredential {
    let mut claims = HashMap::new();
    claims.insert("attr".into(), serde_json::json!("value"));
    VerifiableCredential::new(
        id.into(),
        "did:example:issuer".into(),
        subject.into(),
        claims,
    )
}

#[test]
fn test_create_empty_presentation() {
    let vp = VerifiablePresentation::new(vec![]);
    assert_eq!(vp.verifiable_credential.len(), 0);
    assert_eq!(vp.presentation_type, vec!["VerifiablePresentation"]);
    assert!(vp.holder.is_none());
    assert!(vp.id.is_none());
}

#[test]
fn test_presentation_with_multiple_credentials() {
    let vc1 = make_credential("urn:uuid:vc-1", "did:example:alice");
    let vc2 = make_credential("urn:uuid:vc-2", "did:example:alice");
    let vc3 = make_credential("urn:uuid:vc-3", "did:example:alice");

    let vp = VerifiablePresentation::new(vec![vc1, vc2, vc3]);
    assert_eq!(vp.verifiable_credential.len(), 3);
}

#[test]
fn test_presentation_with_proof() {
    let vc = make_credential("urn:uuid:vc-proof", "did:example:bob");
    let mut vp = VerifiablePresentation::new(vec![vc]);

    let proof = Proof {
        proof_type: "Ed25519Signature2020".into(),
        created: "2025-01-01T00:00:00Z".into(),
        verification_method: "did:example:holder#key-1".into(),
        proof_purpose: "authentication".into(),
        proof_value: Some("zsignature123".into()),
        jws: None,
        nonce: Some("challenge-abc".into()),
        domain: Some("verifier.example.com".into()),
    };
    vp.proof = Some(proof);

    assert!(vp.proof.is_some());
    assert_eq!(
        vp.proof.as_ref().unwrap().proof_purpose,
        "authentication"
    );
    assert_eq!(
        vp.proof.as_ref().unwrap().nonce,
        Some("challenge-abc".into())
    );
}

#[test]
fn test_presentation_with_holder_and_id() {
    let vc = make_credential("urn:uuid:vc-holder", "did:example:carol");
    let mut vp = VerifiablePresentation::new(vec![vc]);

    vp.id = Some("urn:uuid:pres-1".into());
    vp.holder = Some("did:example:carol".into());

    assert_eq!(vp.id, Some("urn:uuid:pres-1".into()));
    assert_eq!(vp.holder, Some("did:example:carol".into()));
}

#[test]
fn test_presentation_request_creation() {
    let mut req = PresentationRequest::new("urn:uuid:req-1".into());
    assert_eq!(req.id, "urn:uuid:req-1");
    assert!(req.query.is_empty());

    req.add_query(vec!["AgeVerificationCredential".into()], true);
    assert_eq!(req.query.len(), 1);
    assert_eq!(req.query[0].query_type, "QueryByExample");
    assert_eq!(req.query[0].credential_query.len(), 1);
}

#[test]
fn test_presentation_request_with_multiple_queries() {
    let mut req = PresentationRequest::new("urn:uuid:req-multi".into());

    req.add_query(vec!["AgeVerificationCredential".into()], true);
    req.add_query(vec!["AddressCredential".into()], false);
    req.add_query(
        vec!["SanctionsCheckCredential".into()],
        true,
    );

    assert_eq!(req.query.len(), 3);
    assert!(req.query[0].credential_query[0].required);
    assert!(!req.query[1].credential_query[0].required);
}

#[test]
fn test_presentation_request_with_challenge() {
    let mut req = PresentationRequest::new("urn:uuid:req-challenge".into());
    req.challenge = Some("nonce-abc-123".into());
    req.domain = Some("verifier.example.com".into());

    assert_eq!(req.challenge, Some("nonce-abc-123".into()));
    assert_eq!(req.domain, Some("verifier.example.com".into()));
}

#[test]
fn test_credential_query_fields() {
    let query = CredentialQuery {
        reason: Some("We need to verify your age".into()),
        required: true,
        credential_type: vec!["AgeVerificationCredential".into()],
        trusted_issuers: Some(vec!["did:example:gov".into()]),
        fields: Some(vec!["age".into(), "date_of_birth".into()]),
    };

    assert_eq!(
        query.trusted_issuers,
        Some(vec!["did:example:gov".into()])
    );
    assert_eq!(query.fields, Some(vec!["age".into(), "date_of_birth".into()]));
}

#[test]
fn test_presentation_json_serialization() {
    let vc = make_credential("urn:uuid:vc-json", "did:example:eve");
    let vp = VerifiablePresentation::new(vec![vc]);

    let json = serde_json::to_string_pretty(&vp).unwrap();
    assert!(json.contains("VerifiablePresentation"));
    assert!(json.contains("did:example:eve"));

    let restored: VerifiablePresentation = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.verifiable_credential.len(), 1);
}
