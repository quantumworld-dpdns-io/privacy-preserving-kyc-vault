use kyc_vault_core::kyc::decision::{Decision, DecisionMaker, DecisionRules, KYCDecision};
use kyc_vault_core::kyc::document::{IdentityDocument, IdentityDocType, LivenessCheck};
use kyc_vault_core::kyc::tier::{default_tiers, KYCTier};
use kyc_vault_core::kyc::workflow::{KYCReview, KYCState, KYCWorkflow, ReviewDecision};
use kyc_vault_core::platform::PlatformConfig;

#[test]
fn test_complete_tier1_kyc_workflow() {
    let mut wf = KYCWorkflow::new(
        "wf-integration-1".into(),
        "did:example:user1".into(),
        "tier-1-email".into(),
        "platform-main".into(),
    );

    assert_eq!(wf.state, KYCState::Initiated);
    assert_eq!(wf.history.len(), 1);

    wf.transition(
        KYCState::DocumentsSubmitted,
        "did:example:user1".into(),
        "Email verification submitted".into(),
    )
    .unwrap();
    assert_eq!(wf.state, KYCState::DocumentsSubmitted);

    wf.transition(
        KYCState::UnderReview,
        "did:example:reviewer".into(),
        "Documents under manual review".into(),
    )
    .unwrap();
    assert_eq!(wf.state, KYCState::UnderReview);

    wf.transition(
        KYCState::Approved,
        "did:example:reviewer".into(),
        "All checks passed".into(),
    )
    .unwrap();
    assert_eq!(wf.state, KYCState::Approved);
    assert_eq!(wf.history.len(), 4);
}

#[test]
fn test_kyc_workflow_rejection_path() {
    let mut wf = KYCWorkflow::new(
        "wf-reject-1".into(),
        "did:example:user2".into(),
        "tier-2-basic".into(),
        "platform-main".into(),
    );

    wf.transition(
        KYCState::DocumentsSubmitted,
        "did:example:user2".into(),
        "ID submitted".into(),
    )
    .unwrap();

    wf.transition(
        KYCState::UnderReview,
        "did:example:reviewer".into(),
        "Review started".into(),
    )
    .unwrap();

    wf.transition(
        KYCState::Rejected,
        "did:example:reviewer".into(),
        "Document did not match provided info".into(),
    )
    .unwrap();

    assert_eq!(wf.state, KYCState::Rejected);
}

#[test]
fn test_additional_info_requested_then_resubmitted() {
    let mut wf = KYCWorkflow::new(
        "wf-addinfo-1".into(),
        "did:example:user3".into(),
        "tier-3-advanced".into(),
        "platform-main".into(),
    );

    wf.transition(
        KYCState::DocumentsSubmitted,
        "did:example:user3".into(),
        "Docs submitted".into(),
    )
    .unwrap();
    wf.transition(
        KYCState::UnderReview,
        "did:example:reviewer".into(),
        "Under review".into(),
    )
    .unwrap();

    wf.transition(
        KYCState::AdditionalInfoRequested,
        "did:example:reviewer".into(),
        "Need clearer photo".into(),
    )
    .unwrap();
    assert_eq!(wf.state, KYCState::AdditionalInfoRequested);

    wf.transition(
        KYCState::DocumentsSubmitted,
        "did:example:user3".into(),
        "Resubmitted clearer photo".into(),
    )
    .unwrap();
    assert_eq!(wf.state, KYCState::DocumentsSubmitted);
}

#[test]
fn test_invalid_transitions_return_error() {
    let mut wf = KYCWorkflow::new(
        "wf-invalid-1".into(),
        "did:example:user4".into(),
        "tier-1".into(),
        "platform-main".into(),
    );

    assert!(wf
        .transition(
            KYCState::Approved,
            "did:example:user4".into(),
            "Skip".into()
        )
        .is_err());
    assert!(wf
        .transition(
            KYCState::Revoked,
            "did:example:user4".into(),
            "Skip".into()
        )
        .is_err());

    wf.transition(
        KYCState::DocumentsSubmitted,
        "did:example:user4".into(),
        "Docs".into(),
    )
    .unwrap();
    assert!(wf
        .transition(
            KYCState::Initiated,
            "did:example:user4".into(),
            "Back".into()
        )
        .is_err());
}

#[test]
fn test_kyc_workflow_expiry_after_approval() {
    let mut wf = KYCWorkflow::new(
        "wf-expire-1".into(),
        "did:example:user5".into(),
        "tier-2".into(),
        "platform-main".into(),
    );

    wf.transition(
        KYCState::DocumentsSubmitted,
        "did:example:user5".into(),
        "Docs".into(),
    )
    .unwrap();
    wf.transition(
        KYCState::UnderReview,
        "did:example:reviewer".into(),
        "Review".into(),
    )
    .unwrap();
    wf.transition(
        KYCState::Approved,
        "did:example:reviewer".into(),
        "Approved".into(),
    )
    .unwrap();

    wf.transition(
        KYCState::Expired,
        "did:example:system".into(),
        "KYC validity expired".into(),
    )
    .unwrap();
    assert_eq!(wf.state, KYCState::Expired);
}

#[test]
fn test_auto_decision_rules() {
    let rules = DecisionRules::default();

    let approve = rules.evaluate(92.0, &[]);
    assert_eq!(approve.decision, Decision::Approve);
    assert_eq!(approve.made_by, DecisionMaker::Automated);
    assert!(approve.confidence >= 0.85);

    let reject = rules.evaluate(15.0, &[]);
    assert_eq!(reject.decision, Decision::Reject);

    let flag = rules.evaluate(50.0, &[]);
    assert_eq!(flag.decision, Decision::FlagForReview);

    let sanctions = rules.evaluate(95.0, &["sanctions_hit".into()]);
    assert_eq!(sanctions.decision, Decision::FlagForReview);
}

#[test]
fn test_identity_document_lifecycle() {
    let doc = IdentityDocument {
        id: "doc-passport-1".into(),
        doc_type: IdentityDocType::Passport,
        country: "US".into(),
        document_number: "X7890123".into(),
        full_name: "John Doe".into(),
        date_of_birth: "1990-05-15".into(),
        expiry_date: Some("2030-05-15".into()),
        file_reference: "s3://bucket/passport-1.pdf".into(),
        file_hash: "sha256-abc123def456".into(),
        extracted_data: HashMap::new(),
    };

    assert!(!doc.is_expired());

    let expired_doc = IdentityDocument {
        expiry_date: Some("2020-01-01".into()),
        ..doc
    };
    assert!(expired_doc.is_expired());

    let doc_no_expiry = IdentityDocument {
        expiry_date: None,
        ..doc
    };
    assert!(!doc_no_expiry.is_expired());
}

#[test]
fn test_liveness_check_scoring() {
    let mut check = LivenessCheck::new("blink-twice-smile".into());
    assert!(!check.passed);
    assert_eq!(check.score, 0.0);

    check.evaluate(0.95, 0.8);
    assert!(check.passed);
    assert_eq!(check.score, 0.95);

    check.evaluate(0.4, 0.8);
    assert!(!check.passed);
}

#[test]
fn test_default_tiers_configuration() {
    let tiers = default_tiers();
    assert_eq!(tiers.len(), 3);

    assert_eq!(tiers[0].level, 1);
    assert_eq!(tiers[0].max_daily_verifications, 5);
    assert_eq!(tiers[0].price_usd, 0.0);

    assert_eq!(tiers[1].level, 2);
    assert!(tiers[1].max_credit.unwrap() > tiers[0].max_credit.unwrap());

    assert_eq!(tiers[2].level, 3);
    assert_eq!(tiers[2].requirements.len(), 4);
    assert!(tiers[2].requirements.contains(&"liveness".into()));
}

#[test]
fn test_review_decision_tracking() {
    let mut wf = KYCWorkflow::new(
        "wf-review-1".into(),
        "did:example:user6".into(),
        "tier-2".into(),
        "platform-main".into(),
    );

    let review = KYCReview {
        reviewer_did: "did:example:human-reviewer-1".into(),
        decision: ReviewDecision::Approved,
        reason: Some("All identity documents verified manually".into()),
        reviewed_at: "2025-06-01T10:00:00Z".into(),
        evidence_hash: Some("sha256:evidence123".into()),
    };
    wf.add_review(review);
    assert_eq!(wf.reviews.len(), 1);
    assert_eq!(wf.reviews[0].decision, ReviewDecision::Approved);
}

#[test]
fn test_platform_config_with_tier_mapping() {
    let platform = PlatformConfig::new(
        "plat-kyc-1".into(),
        "KYC Provider Inc".into(),
        "sk_live_abc123def456",
    );

    assert_eq!(platform.status, kyc_vault_core::platform::PlatformStatus::PendingVerification);
    assert!(platform.verify_api_key("sk_live_abc123def456"));
    assert!(!platform.verify_api_key("wrong_key"));
    assert!(platform.allowed_credential_types.contains(&"AgeVerificationCredential".into()));
    assert!(platform.consent_required);
}
