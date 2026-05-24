use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReputationScore {
    pub subject_did: String,
    pub score: f64,
    pub confidence: f64,
    pub last_updated: i64,
}

impl ReputationScore {
    pub fn new(subject_did: String, score: f64) -> Self {
        Self {
            subject_did,
            score,
            confidence: 1.0,
            last_updated: chrono::Utc::now().timestamp(),
        }
    }
}
