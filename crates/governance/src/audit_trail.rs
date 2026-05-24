use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::LinkedList;
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum AuditError {
    #[error("Invalid chain: {0}")]
    InvalidChain(String),
    #[error("Entry not found: {0}")]
    EntryNotFound(Uuid),
    #[error("Tamper detected at entry {0}")]
    TamperDetected(Uuid),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditAction {
    DidCreated(String),
    DidUpdated(String),
    DidDeactivated(String),
    CredentialIssued(String),
    CredentialRevoked(String),
    GovernanceRuleChanged(String),
    VoteCast(Uuid),
    ProposalCreated(Uuid),
    AuthorityNodeAdded(Uuid),
    AuthorityNodeRemoved(Uuid),
    ProtocolUpgrade(Uuid),
    ParameterChange(String, serde_json::Value),
    TrustFrameworkUpdated(String),
    JurisdictionRuleChanged(String),
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: Uuid,
    pub sequence: u64,
    pub action: AuditAction,
    pub actor_did: String,
    pub target_did: Option<String>,
    pub details: serde_json::Value,
    pub timestamp: DateTime<Utc>,
    pub previous_hash: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditTrail {
    pub name: String,
    pub events: LinkedList<AuditEvent>,
    pub last_hash: String,
    pub event_count: u64,
    pub created_at: DateTime<Utc>,
}

impl AuditEvent {
    fn compute_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(&self.sequence.to_le_bytes());
        hasher.update(format!("{:?}", self.action).as_bytes());
        hasher.update(self.actor_did.as_bytes());
        hasher.update(self.timestamp.to_rfc3339().as_bytes());
        hasher.update(self.previous_hash.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn new(
        sequence: u64,
        action: AuditAction,
        actor_did: &str,
        details: serde_json::Value,
        previous_hash: &str,
    ) -> Self {
        let mut event = Self {
            id: Uuid::new_v4(),
            sequence,
            action,
            actor_did: actor_did.to_string(),
            target_did: None,
            details,
            timestamp: Utc::now(),
            previous_hash: previous_hash.to_string(),
            hash: String::new(),
        };
        event.hash = event.compute_hash();
        event
    }
}

impl AuditTrail {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            events: LinkedList::new(),
            last_hash: String::from("genesis"),
            event_count: 0,
            created_at: Utc::now(),
        }
    }

    pub fn append(
        &mut self,
        action: AuditAction,
        actor_did: &str,
        details: serde_json::Value,
    ) -> Uuid {
        let sequence = self.event_count + 1;
        let event = AuditEvent::new(sequence, action, actor_did, details, &self.last_hash);
        let id = event.id;
        self.last_hash = event.hash.clone();
        self.events.push_back(event);
        self.event_count = sequence;
        id
    }

    pub fn verify_integrity(&self) -> Result<(), AuditError> {
        let mut prev_hash = String::from("genesis");
        for event in &self.events {
            if event.previous_hash != prev_hash {
                return Err(AuditError::TamperDetected(event.id));
            }
            let computed = event.compute_hash();
            if computed != event.hash {
                return Err(AuditError::TamperDetected(event.id));
            }
            prev_hash = event.hash.clone();
        }
        if prev_hash != self.last_hash {
            return Err(AuditError::InvalidChain(
                "Last hash mismatch".into(),
            ));
        }
        Ok(())
    }

    pub fn get_events_by_actor(&self, actor_did: &str) -> Vec<&AuditEvent> {
        self.events
            .iter()
            .filter(|e| e.actor_did == actor_did)
            .collect()
    }

    pub fn get_events_by_action(&self, action_type: &str) -> Vec<&AuditEvent> {
        self.events
            .iter()
            .filter(|e| format!("{:?}", e.action).contains(action_type))
            .collect()
    }

    pub fn recent_events(&self, n: usize) -> Vec<&AuditEvent> {
        self.events.iter().rev().take(n).collect()
    }

    pub fn export_json(&self) -> serde_json::Value {
        let events: Vec<&AuditEvent> = self.events.iter().collect();
        serde_json::json!({
            "name": self.name,
            "event_count": self.event_count,
            "last_hash": self.last_hash,
            "events": events,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_append_and_verify() {
        let mut trail = AuditTrail::new("Governance Audit");
        let id = trail.append(
            AuditAction::GovernanceRuleChanged("test-rule".into()),
            "did:admin:1",
            serde_json::json!({"change": "updated threshold"}),
        );
        assert_eq!(trail.event_count, 1);
        assert!(trail.verify_integrity().is_ok());
    }

    #[test]
    fn test_tamper_detection() {
        let mut trail = AuditTrail::new("Test");
        trail.append(
            AuditAction::Custom("entry1".into()),
            "did:a",
            serde_json::json!({}),
        );
        trail.append(
            AuditAction::Custom("entry2".into()),
            "did:b",
            serde_json::json!({}),
        );
        assert!(trail.verify_integrity().is_ok());
        if let Some(mut last) = trail.events.back_mut() {
            last.hash = "tampered".into();
        }
        assert!(trail.verify_integrity().is_err());
    }

    #[test]
    fn test_event_filtering() {
        let mut trail = AuditTrail::new("Test");
        trail.append(
            AuditAction::VoteCast(Uuid::new_v4()),
            "did:alice",
            serde_json::json!({}),
        );
        trail.append(
            AuditAction::VoteCast(Uuid::new_v4()),
            "did:bob",
            serde_json::json!({}),
        );
        trail.append(
            AuditAction::ParameterChange("param".into(), serde_json::json!(42)),
            "did:alice",
            serde_json::json!({}),
        );
        assert_eq!(trail.get_events_by_actor("did:alice").len(), 2);
        assert_eq!(trail.get_events_by_action("VoteCast").len(), 2);
    }

    #[test]
    fn test_recent_events() {
        let mut trail = AuditTrail::new("Test");
        for i in 0..5 {
            trail.append(
                AuditAction::Custom(format!("entry{}", i)),
                "did:a",
                serde_json::json!({"i": i}),
            );
        }
        assert_eq!(trail.recent_events(3).len(), 3);
    }
}
