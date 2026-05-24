use kyc_vault_core::kyc::document::{IdentityDocument, IdentityDocType, LivenessCheck};
use kyc_vault_core::kyc::workflow::{KYCDocument, KYCReview, KYCState, KYCWorkflow, ReviewDecision, DocumentStatus};

fn make_workflow(id: &str, subject: &str) -> KYCWorkflow {
    KYCWorkflow::new(
        id.into(),
        subject.into(),
        "tier-2-basic".into(),
        "platform-main".into(),
    )
}

#[test]
fn test_kyc_state_machine_initiated_state() {
    let wf = make_workflow("wf-state-1", "did:example:user1");
    assert_eq!(wf.state, KYCState::Initiated);
    assert_eq!(wf.history.len(), 1);
    assert_eq!(wf.history[0].event_type, "created");
}

#[test]
fn test_kyc_full_approval_flow() {
    let mut wf = make_workflow("wf-full-1", "did:example:user2");

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user2".into(), "Submitting documents".into()).unwrap();
    assert_eq!(wf.state, KYCState::DocumentsSubmitted);

    wf.transition(KYCState::UnderReview, "did:example:reviewer".into(), "Review started".into()).unwrap();
    assert_eq!(wf.state, KYCState::UnderReview);

    wf.transition(KYCState::Approved, "did:example:reviewer".into(), "All checks passed".into()).unwrap();
    assert_eq!(wf.state, KYCState::Approved);
    assert_eq!(wf.history.len(), 4);
}

#[test]
fn test_kyc_rejection_flow() {
    let mut wf = make_workflow("wf-reject-1", "did:example:user3");

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user3".into(), "Docs in".into()).unwrap();
    wf.transition(KYCState::UnderReview, "did:example:reviewer".into(), "Reviewing".into()).unwrap();
    wf.transition(KYCState::Rejected, "did:example:reviewer".into(), "Document mismatch".into()).unwrap();

    assert_eq!(wf.state, KYCState::Rejected);
    assert_eq!(wf.history.len(), 4);
    assert_eq!(wf.history[3].detail, "Document mismatch");
}

#[test]
fn test_kyc_additional_info_flow() {
    let mut wf = make_workflow("wf-addinfo-1", "did:example:user4");

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user4".into(), "Initial".into()).unwrap();
    wf.transition(KYCState::UnderReview, "did:example:reviewer".into(), "Review".into()).unwrap();
    wf.transition(KYCState::AdditionalInfoRequested, "did:example:reviewer".into(), "Need clearer photo".into()).unwrap();
    assert_eq!(wf.state, KYCState::AdditionalInfoRequested);

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user4".into(), "Resubmitted".into()).unwrap();
    assert_eq!(wf.state, KYCState::DocumentsSubmitted);
}

#[test]
fn test_kyc_expiry_after_approval() {
    let mut wf = make_workflow("wf-expire-1", "did:example:user5");

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user5".into(), "submitted".into()).unwrap();
    wf.transition(KYCState::UnderReview, "did:example:reviewer".into(), "reviewing".into()).unwrap();
    wf.transition(KYCState::Approved, "did:example:reviewer".into(), "approved".into()).unwrap();
    wf.transition(KYCState::Expired, "did:example:system".into(), "KYC expired".into()).unwrap();

    assert_eq!(wf.state, KYCState::Expired);
}

#[test]
fn test_kyc_revocation_after_approval() {
    let mut wf = make_workflow("wf-revoke-1", "did:example:user6");

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user6".into(), "submitted".into()).unwrap();
    wf.transition(KYCState::UnderReview, "did:example:reviewer".into(), "reviewing".into()).unwrap();
    wf.transition(KYCState::Approved, "did:example:reviewer".into(), "approved".into()).unwrap();
    wf.transition(KYCState::Revoked, "did:example:admin".into(), "Fraud detected".into()).unwrap();

    assert_eq!(wf.state, KYCState::Revoked);
}

#[test]
fn test_invalid_transitions_return_errors() {
    let mut wf = make_workflow("wf-invalid-1", "did:example:user7");

    assert!(wf.transition(KYCState::Approved, "did:example:user7".into(), "skip".into()).is_err());
    assert!(wf.transition(KYCState::Revoked, "did:example:user7".into(), "skip".into()).is_err());

    wf.transition(KYCState::DocumentsSubmitted, "did:example:user7".into(), "docs".into()).unwrap();
    assert!(wf.transition(KYCState::Initiated, "did:example:user7".into(), "back".into()).is_err());
}

#[test]
fn test_document_management_add_and_verify() {
    let mut wf = make_workflow("wf-doc-1", "did:example:user8");

    let doc = KYCDocument {
        id: "doc-passport-1".into(),
        document_type: "passport".into(),
        file_hash: "sha256:abc123".into(),
        status: DocumentStatus::Pending,
        uploaded_at: "2025-06-01T00:00:00Z".into(),
        verified_at: None,
    };
    wf.add_document(doc);
    assert_eq!(wf.documents.len(), 1);
    assert_eq!(wf.documents[0].document_type, "passport");
    assert_eq!(wf.documents[0].status, DocumentStatus::Pending);
}

#[test]
fn test_document_management_multiple_documents() {
    let mut wf = make_workflow("wf-doc-2", "did:example:user9");

    let types = vec!["passport", "selfie", "address_proof"];
    for (i, doc_type) in types.iter().enumerate() {
        let doc = KYCDocument {
            id: format!("doc-{}", i),
            document_type: doc_type.to_string(),
            file_hash: format!("sha256:hash{}", i),
            status: DocumentStatus::Pending,
            uploaded_at: "2025-06-01T00:00:00Z".into(),
            verified_at: None,
        };
        wf.add_document(doc);
    }

    assert_eq!(wf.documents.len(), 3);
    assert_eq!(wf.documents[0].document_type, "passport");
    assert_eq!(wf.documents[2].document_type, "address_proof");
}

#[test]
fn test_review_tracking() {
    let mut wf = make_workflow("wf-review-1", "did:example:user10");

    let review = KYCReview {
        reviewer_did: "did:example:reviewer-1".into(),
        decision: ReviewDecision::Approved,
        reason: Some("All documents verified".into()),
        reviewed_at: "2025-06-01T12:00:00Z".into(),
        evidence_hash: Some("sha256:evidence123".into()),
    };
    wf.add_review(review);

    assert_eq!(wf.reviews.len(), 1);
    assert_eq!(wf.reviews[0].decision, ReviewDecision::Approved);
    assert_eq!(wf.reviews[0].reviewer_did, "did:example:reviewer-1");
}

#[test]
fn test_review_rejected_with_reason() {
    let mut wf = make_workflow("wf-review-2", "did:example:user11");

    let review = KYCReview {
        reviewer_did: "did:example:reviewer-2".into(),
        decision: ReviewDecision::Rejected,
        reason: Some("Face does not match ID photo".into()),
        reviewed_at: "2025-06-02T00:00:00Z".into(),
        evidence_hash: None,
    };
    wf.add_review(review);
    assert_eq!(wf.reviews[0].decision, ReviewDecision::Rejected);
    assert_eq!(wf.reviews[0].reason.as_deref(), Some("Face does not match ID photo"));
}

#[test]
fn test_identity_document_expiry() {
    let doc = IdentityDocument {
        id: "id-1".into(),
        doc_type: IdentityDocType::Passport,
        country: "US".into(),
        document_number: "AB123456".into(),
        full_name: "John Doe".into(),
        date_of_birth: "1990-01-01".into(),
        expiry_date: Some("2030-01-01".into()),
        file_reference: "s3://bucket/id.pdf".into(),
        file_hash: "sha256:abc".into(),
        extracted_data: std::collections::HashMap::new(),
    };
    assert!(!doc.is_expired());

    let mut expired = doc.clone();
    expired.expiry_date = Some("2020-01-01".into());
    assert!(expired.is_expired());

    let mut no_expiry = doc.clone();
    no_expiry.expiry_date = None;
    assert!(!no_expiry.is_expired());
}

#[test]
fn test_liveness_check_pass_and_fail() {
    let mut check = LivenessCheck::new("blink-left-right".into());
    assert!(!check.passed);
    assert_eq!(check.score, 0.0);

    check.evaluate(0.95, 0.8);
    assert!(check.passed);
    assert_eq!(check.score, 0.95);

    check.evaluate(0.3, 0.8);
    assert!(!check.passed);
}

#[test]
fn test_liveness_check_at_threshold_boundary() {
    let mut check = LivenessCheck::new("smile-twice".into());
    check.evaluate(0.8, 0.8);
    assert!(check.passed);

    check.evaluate(0.79, 0.8);
    assert!(!check.passed);
}
