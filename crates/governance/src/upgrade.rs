use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum UpgradeError {
    #[error("Upgrade not found: {0}")]
    UpgradeNotFound(Uuid),
    #[error("Incompatible upgrade: {0}")]
    IncompatibleUpgrade(String),
    #[error("Upgrade already applied")]
    AlreadyApplied,
    #[error("Minimum delay not met")]
    MinimumDelayNotMet,
    #[error("Insufficient approvals: {0}/{1}")]
    InsufficientApprovals(u64, u64),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UpgradeStatus {
    Proposed,
    Approved,
    Scheduled,
    InProgress,
    Completed,
    Failed,
    RolledBack,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolUpgrade {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub from_version: String,
    pub to_version: String,
    pub proposed_by: String,
    pub actions: Vec<UpgradeAction>,
    pub status: UpgradeStatus,
    pub approvals: Vec<UpgradeApproval>,
    pub required_approvals: u64,
    pub scheduled_time: Option<DateTime<Utc>>,
    pub min_delay_hours: u64,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpgradeAction {
    pub target_module: String,
    pub action_type: ActionType,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    UpdateParameter,
    MigrateStorage,
    ReplaceModule,
    AddFeature,
    RemoveFeature,
    EmergencyHalt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpgradeApproval {
    pub approver_did: String,
    pub approved_at: DateTime<Utc>,
    pub signature: Option<String>,
}

impl ProtocolUpgrade {
    pub fn new(
        name: &str,
        description: &str,
        from_version: &str,
        to_version: &str,
        proposed_by: &str,
        actions: Vec<UpgradeAction>,
        required_approvals: u64,
        min_delay_hours: u64,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            description: description.to_string(),
            from_version: from_version.to_string(),
            to_version: to_version.to_string(),
            proposed_by: proposed_by.to_string(),
            actions,
            status: UpgradeStatus::Proposed,
            approvals: Vec::new(),
            required_approvals,
            scheduled_time: None,
            min_delay_hours,
            created_at: Utc::now(),
            completed_at: None,
        }
    }

    pub fn hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.name.as_bytes());
        hasher.update(self.from_version.as_bytes());
        hasher.update(self.to_version.as_bytes());
        for action in &self.actions {
            hasher.update(action.target_module.as_bytes());
        }
        hex::encode(hasher.finalize())
    }

    pub fn add_approval(&mut self, approver_did: &str) -> Result<(), UpgradeError> {
        if self.status != UpgradeStatus::Proposed && self.status != UpgradeStatus::Approved {
            return Err(UpgradeError::AlreadyApplied);
        }
        self.approvals.push(UpgradeApproval {
            approver_did: approver_did.to_string(),
            approved_at: Utc::now(),
            signature: None,
        });
        Ok(())
    }

    pub fn is_approved(&self) -> bool {
        self.approvals.len() as u64 >= self.required_approvals
    }

    pub fn can_execute(&self, now: DateTime<Utc>) -> bool {
        self.is_approved()
            && self.status == UpgradeStatus::Approved
            && self
                .scheduled_time
                .map(|t| now >= t)
                .unwrap_or(false)
    }

    pub fn is_compatible(&self, current_version: &str) -> Result<(), UpgradeError> {
        if self.from_version != current_version {
            return Err(UpgradeError::IncompatibleUpgrade(format!(
                "Current version is {}, upgrade requires {}",
                current_version, self.from_version
            )));
        }
        Ok(())
    }

    pub fn needs_migration(&self) -> bool {
        self.actions
            .iter()
            .any(|a| matches!(a.action_type, ActionType::MigrateStorage))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upgrade_creation() {
        let upgrade = ProtocolUpgrade::new(
            "v2.0 Upgrade",
            "Major protocol upgrade",
            "1.0.0",
            "2.0.0",
            "did:gov:1",
            vec![],
            3,
            48,
        );
        assert_eq!(upgrade.status, UpgradeStatus::Proposed);
        assert!(!upgrade.is_approved());
    }

    #[test]
    fn test_approval_threshold() {
        let mut upgrade = ProtocolUpgrade::new(
            "Test Upgrade",
            "desc",
            "1.0.0",
            "2.0.0",
            "did:gov:1",
            vec![],
            2,
            48,
        );
        upgrade.add_approval("did:auth:1").unwrap();
        assert!(!upgrade.is_approved());
        upgrade.add_approval("did:auth:2").unwrap();
        assert!(upgrade.is_approved());
    }

    #[test]
    fn test_version_compatibility() {
        let upgrade = ProtocolUpgrade::new(
            "Test",
            "desc",
            "1.0.0",
            "2.0.0",
            "did:gov:1",
            vec![],
            1,
            48,
        );
        assert!(upgrade.is_compatible("1.0.0").is_ok());
        assert!(upgrade.is_compatible("1.5.0").is_err());
    }

    #[test]
    fn test_upgrade_hash() {
        let u1 = ProtocolUpgrade::new(
            "Upgrade A",
            "",
            "1.0.0",
            "2.0.0",
            "did:gov:1",
            vec![],
            1,
            48,
        );
        let u2 = ProtocolUpgrade::new(
            "Upgrade B",
            "",
            "1.0.0",
            "2.0.0",
            "did:gov:1",
            vec![],
            1,
            48,
        );
        assert_ne!(u1.hash(), u2.hash());
    }
}
