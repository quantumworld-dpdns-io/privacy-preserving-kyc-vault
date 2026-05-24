use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentRecord {
    pub id: String,
    pub user_id: String,
    pub purpose: String,
    pub scope: Vec<String>,
    pub granted: bool,
    pub timestamp: String,
    pub expires_at: Option<String>,
    pub revoked_at: Option<String>,
    pub consent_version: String,
    pub source: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub purpose: String,
    pub scope: Vec<String>,
    pub required: bool,
    pub version: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentManager {
    pub records: Vec<ConsentRecord>,
    pub templates: Vec<ConsentTemplate>,
}

impl ConsentManager {
    pub fn new() -> Self {
        Self {
            records: Vec::new(),
            templates: Vec::new(),
        }
    }

    pub fn register_template(&mut self, template: ConsentTemplate) {
        self.templates.push(template);
    }

    pub fn record_consent(&mut self, user_id: String, purpose: String, scope: Vec<String>, source: String) -> ConsentRecord {
        let record = ConsentRecord {
            id: format!("urn:consent:{}", uuid::Uuid::new_v4()),
            user_id,
            purpose,
            scope,
            granted: true,
            timestamp: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
            revoked_at: None,
            consent_version: "1.0".into(),
            source,
            metadata: HashMap::new(),
        };
        self.records.push(record.clone());
        record
    }

    pub fn revoke_consent(&mut self, consent_id: &str) -> bool {
        if let Some(record) = self.records.iter_mut().find(|r| r.id == consent_id) {
            record.granted = false;
            record.revoked_at = Some(chrono::Utc::now().to_rfc3339());
            true
        } else {
            false
        }
    }

    pub fn check_consent(&self, user_id: &str, purpose: &str, scope: &str) -> bool {
        self.records.iter().any(|r| {
            r.user_id == user_id
                && r.purpose == purpose
                && r.scope.contains(&scope.to_string())
                && r.granted
                && r.revoked_at.is_none()
                && r.expires_at
                    .as_ref()
                    .map(|exp| chrono::Utc::now() < chrono::DateTime::parse_from_rfc3339(exp).unwrap_or_else(|_| chrono::Utc::now().into()))
                    .unwrap_or(true)
        })
    }

    pub fn get_user_consents(&self, user_id: &str) -> Vec<&ConsentRecord> {
        self.records
            .iter()
            .filter(|r| r.user_id == user_id)
            .collect()
    }

    pub fn get_active_consents(&self, user_id: &str) -> Vec<&ConsentRecord> {
        self.records
            .iter()
            .filter(|r| r.user_id == user_id && r.granted && r.revoked_at.is_none())
            .collect()
    }

    pub fn get_purpose_template(&self, purpose: &str) -> Option<&ConsentTemplate> {
        self.templates.iter().find(|t| t.purpose == purpose)
    }

    pub fn revoke_all_user_consents(&mut self, user_id: &str) -> usize {
        let count = self
            .records
            .iter_mut()
            .filter(|r| r.user_id == user_id && r.granted)
            .map(|r| {
                r.granted = false;
                r.revoked_at = Some(chrono::Utc::now().to_rfc3339());
            })
            .count();
        count
    }
}

impl Default for ConsentManager {
    fn default() -> Self {
        Self::new()
    }
}
