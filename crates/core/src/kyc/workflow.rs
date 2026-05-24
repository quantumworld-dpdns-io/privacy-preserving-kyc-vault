use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum KYCState {
    Initiated,
    DocumentsSubmitted,
    UnderReview,
    AdditionalInfoRequested,
    Approved,
    Rejected,
    Expired,
    Revoked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYCWorkflow {
    pub id: String,
    pub subject_did: String,
    pub state: KYCState,
    pub tier: String,
    pub platform_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub expires_at: Option<String>,
    pub documents: Vec<KYCDocument>,
    pub reviews: Vec<KYCReview>,
    pub history: Vec<KYCEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYCDocument {
    pub id: String,
    pub document_type: String,
    pub file_hash: String,
    pub status: DocumentStatus,
    pub uploaded_at: String,
    pub verified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DocumentStatus {
    Pending,
    Verified,
    Rejected,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYCReview {
    pub reviewer_did: String,
    pub decision: ReviewDecision,
    pub reason: Option<String>,
    pub reviewed_at: String,
    pub evidence_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ReviewDecision {
    Approved,
    Rejected,
    RequestMoreInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYCEvent {
    pub event_type: String,
    pub timestamp: String,
    pub actor: String,
    pub detail: String,
}

impl KYCWorkflow {
    pub fn new(id: String, subject_did: String, tier: String, platform_id: String) -> Self {
        Self {
            id,
            subject_did,
            state: KYCState::Initiated,
            tier,
            platform_id,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
            documents: Vec::new(),
            reviews: Vec::new(),
            history: vec![KYCEvent {
                event_type: "created".into(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                actor: subject_did.clone(),
                detail: "KYC workflow initiated".into(),
            }],
        }
    }

    pub fn transition(&mut self, new_state: KYCState, actor: String, detail: String) -> Result<(), String> {
        if !self.is_valid_transition(&new_state) {
            return Err(format!("Invalid transition from {:?} to {:?}", self.state, new_state));
        }
        self.state = new_state;
        self.updated_at = chrono::Utc::now().to_rfc3339();
        self.history.push(KYCEvent {
            event_type: format!("state_change:{:?}", self.state),
            timestamp: chrono::Utc::now().to_rfc3339(),
            actor,
            detail,
        });
        Ok(())
    }

    fn is_valid_transition(&self, new: &KYCState) -> bool {
        matches!(
            (&self.state, new),
            (KYCState::Initiated, KYCState::DocumentsSubmitted)
                | (KYCState::DocumentsSubmitted, KYCState::UnderReview)
                | (KYCState::UnderReview, KYCState::Approved)
                | (KYCState::UnderReview, KYCState::Rejected)
                | (KYCState::UnderReview, KYCState::AdditionalInfoRequested)
                | (KYCState::AdditionalInfoRequested, KYCState::DocumentsSubmitted)
                | (KYCState::AdditionalInfoRequested, KYCState::Rejected)
                | (KYCState::Approved, KYCState::Expired)
                | (KYCState::Approved, KYCState::Revoked)
        )
    }

    pub fn add_document(&mut self, doc: KYCDocument) {
        self.documents.push(doc);
    }

    pub fn add_review(&mut self, review: KYCReview) {
        self.reviews.push(review);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workflow_lifecycle() {
        let mut wf = KYCWorkflow::new(
            "wf-1".into(),
            "did:example:subject".into(),
            "tier-2".into(),
            "platform-1".into(),
        );

        assert_eq!(wf.state, KYCState::Initiated);
        assert_eq!(wf.history.len(), 1);

        wf.transition(KYCState::DocumentsSubmitted, "did:example:subject".into(), "Submitted documents".into()).unwrap();
        assert_eq!(wf.state, KYCState::DocumentsSubmitted);

        wf.transition(KYCState::UnderReview, "did:example:reviewer".into(), "Under review".into()).unwrap();
        assert_eq!(wf.state, KYCState::UnderReview);

        wf.transition(KYCState::Approved, "did:example:reviewer".into(), "KYC approved".into()).unwrap();
        assert_eq!(wf.state, KYCState::Approved);
        assert_eq!(wf.history.len(), 4);
    }

    #[test]
    fn test_invalid_transition() {
        let mut wf = KYCWorkflow::new(
            "wf-2".into(),
            "did:example:subject".into(),
            "tier-1".into(),
            "platform-1".into(),
        );

        assert!(wf.transition(KYCState::Approved, "did:example:bad".into(), "Skip".into()).is_err());
    }
}
