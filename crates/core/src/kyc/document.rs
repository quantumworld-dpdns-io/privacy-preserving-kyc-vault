use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityDocument {
    pub id: String,
    pub doc_type: IdentityDocType,
    pub country: String,
    pub document_number: String,
    pub full_name: String,
    pub date_of_birth: String,
    pub expiry_date: Option<String>,
    pub file_reference: String,
    pub file_hash: String,
    pub extracted_data: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IdentityDocType {
    Passport,
    NationalId,
    DriversLicense,
    ResidencePermit,
    Other(String),
}

impl IdentityDocument {
    pub fn is_expired(&self) -> bool {
        if let Some(ref expiry) = self.expiry_date {
            if let Ok(exp) = chrono::NaiveDate::parse_from_str(expiry, "%Y-%m-%d") {
                return chrono::Utc::now().date_naive() > exp;
            }
        }
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LivenessCheck {
    pub id: String,
    pub challenge: String,
    pub response_video_ref: String,
    pub score: f64,
    pub passed: bool,
    pub checked_at: String,
}

impl LivenessCheck {
    pub fn new(challenge: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            challenge,
            response_video_ref: String::new(),
            score: 0.0,
            passed: false,
            checked_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn evaluate(&mut self, score: f64, threshold: f64) {
        self.score = score;
        self.passed = score >= threshold;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_id_document_expiry() {
        let doc = IdentityDocument {
            id: "doc-1".into(),
            doc_type: IdentityDocType::Passport,
            country: "US".into(),
            document_number: "123456789".into(),
            full_name: "Alice Smith".into(),
            date_of_birth: "1990-01-01".into(),
            expiry_date: Some("2020-01-01".into()),
            file_reference: "ref-1".into(),
            file_hash: "abc123".into(),
            extracted_data: std::collections::HashMap::new(),
        };
        assert!(doc.is_expired());
    }

    #[test]
    fn test_liveness_check() {
        let mut check = LivenessCheck::new("blink-left-right".into());
        check.evaluate(0.95, 0.8);
        assert!(check.passed);
        check.evaluate(0.5, 0.8);
        assert!(!check.passed);
    }
}
