use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeletionStatus {
    Pending,
    InProgress,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletionRequest {
    pub id: String,
    pub user_id: String,
    pub requested_at: String,
    pub status: DeletionStatus,
    pub scope: DeletionScope,
    pub completed_at: Option<String>,
    pub verified_at: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeletionScope {
    All,
    Specific { data_types: Vec<String> },
    TimeRange { from: String, to: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletionLog {
    pub id: String,
    pub request_id: String,
    pub data_type: String,
    pub records_affected: u64,
    pub deleted_at: String,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeletionManager {
    pub requests: HashMap<String, DeletionRequest>,
    pub logs: Vec<DeletionLog>,
}

impl DeletionManager {
    pub fn new() -> Self {
        Self {
            requests: HashMap::new(),
            logs: Vec::new(),
        }
    }

    pub fn create_request(
        &mut self,
        user_id: String,
        scope: DeletionScope,
    ) -> DeletionRequest {
        let request = DeletionRequest {
            id: format!("urn:deletion:{}", uuid::Uuid::new_v4()),
            user_id,
            requested_at: chrono::Utc::now().to_rfc3339(),
            status: DeletionStatus::Pending,
            scope,
            completed_at: None,
            verified_at: None,
            metadata: HashMap::new(),
        };
        let id = request.id.clone();
        self.requests.insert(id.clone(), request.clone());
        request
    }

    pub fn execute_deletion(
        &mut self,
        request_id: &str,
        data_type: &str,
        records_affected: u64,
    ) -> Result<(), String> {
        let request = self
            .requests
            .get_mut(request_id)
            .ok_or_else(|| format!("Request not found: {}", request_id))?;

        request.status = DeletionStatus::InProgress;

        let log = DeletionLog {
            id: format!("urn:deletion-log:{}", uuid::Uuid::new_v4()),
            request_id: request_id.to_string(),
            data_type: data_type.to_string(),
            records_affected,
            deleted_at: chrono::Utc::now().to_rfc3339(),
            verified: false,
        };

        self.logs.push(log);
        Ok(())
    }

    pub fn complete_deletion(&mut self, request_id: &str) -> Result<(), String> {
        let request = self
            .requests
            .get_mut(request_id)
            .ok_or_else(|| format!("Request not found: {}", request_id))?;

        request.status = DeletionStatus::Completed;
        request.completed_at = Some(chrono::Utc::now().to_rfc3339());
        Ok(())
    }

    pub fn verify_deletion(&mut self, request_id: &str) -> Result<bool, String> {
        let request = self
            .requests
            .get_mut(request_id)
            .ok_or_else(|| format!("Request not found: {}", request_id))?;

        request.verified_at = Some(chrono::Utc::now().to_rfc3339());

        let all_verified = self
            .logs
            .iter_mut()
            .filter(|l| l.request_id == request_id)
            .all(|l| {
                l.verified = true;
                true
            });

        Ok(all_verified)
    }

    pub fn get_request(&self, request_id: &str) -> Option<&DeletionRequest> {
        self.requests.get(request_id)
    }

    pub fn get_user_requests(&self, user_id: &str) -> Vec<&DeletionRequest> {
        self.requests
            .values()
            .filter(|r| r.user_id == user_id)
            .collect()
    }

    pub fn get_deletion_logs(&self, request_id: &str) -> Vec<&DeletionLog> {
        self.logs.iter().filter(|l| l.request_id == request_id).collect()
    }

    pub fn has_pending_requests(&self, user_id: &str) -> bool {
        self.requests.values().any(|r| {
            r.user_id == user_id
                && matches!(r.status, DeletionStatus::Pending | DeletionStatus::InProgress)
        })
    }
}

impl Default for DeletionManager {
    fn default() -> Self {
        Self::new()
    }
}
