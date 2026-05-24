use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum TrustFrameworkError {
    #[error("Framework not found: {0}")]
    FrameworkNotFound(String),
    #[error("Compliance check failed: {0}")]
    ComplianceFailed(String),
    #[error("Unsupported framework: {0}")]
    UnsupportedFramework(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FrameworkStandard {
    Eidas,
    Gdpr,
    PSD2,
    Aml5,
    FinCEN,
    FATF,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustFramework {
    pub id: Uuid,
    pub name: String,
    pub standard: FrameworkStandard,
    pub version: String,
    pub requirements: Vec<FrameworkRequirement>,
    pub is_active: bool,
    pub valid_from: DateTime<Utc>,
    pub valid_until: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameworkRequirement {
    pub id: String,
    pub description: String,
    pub required_level: u32,
    pub checks: Vec<String>,
}

impl TrustFramework {
    pub fn new(
        name: &str,
        standard: FrameworkStandard,
        version: &str,
        requirements: Vec<FrameworkRequirement>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.to_string(),
            standard,
            version: version.to_string(),
            requirements,
            is_active: true,
            valid_from: Utc::now(),
            valid_until: None,
        }
    }

    pub fn eidas() -> Self {
        Self::new(
            "eIDAS 2.0",
            FrameworkStandard::Eidas,
            "2.0",
            vec![
                FrameworkRequirement {
                    id: "eidas-1".into(),
                    description: "Qualified electronic signature".into(),
                    required_level: 3,
                    checks: vec!["signature_algorithm".into(), "key_storage".into()],
                },
                FrameworkRequirement {
                    id: "eidas-2".into(),
                    description: "Identity proofing at LoA High".into(),
                    required_level: 4,
                    checks: vec!["identity_proofing".into(), "document_verification".into()],
                },
            ],
        )
    }

    pub fn gdpr() -> Self {
        Self::new(
            "GDPR Compliance",
            FrameworkStandard::Gdpr,
            "2018",
            vec![
                FrameworkRequirement {
                    id: "gdpr-5".into(),
                    description: "Data minimization".into(),
                    required_level: 2,
                    checks: vec!["minimal_data_collection".into()],
                },
                FrameworkRequirement {
                    id: "gdpr-17".into(),
                    description: "Right to erasure".into(),
                    required_level: 3,
                    checks: vec!["data_deletion_capability".into()],
                },
            ],
        )
    }

    pub fn check_compliance(
        &self,
        capability_proof: &[String],
    ) -> Result<Vec<ComplianceResult>, TrustFrameworkError> {
        let results: Vec<ComplianceResult> = self
            .requirements
            .iter()
            .map(|req| {
                let passed = req.checks.iter().all(|check| capability_proof.contains(check));
                ComplianceResult {
                    requirement_id: req.id.clone(),
                    description: req.description.clone(),
                    passed,
                    details: if passed {
                        "All checks passed".into()
                    } else {
                        "Some checks failed".into()
                    },
                }
            })
            .collect();
        Ok(results)
    }

    pub fn is_fully_compliant(&self, capability_proof: &[String]) -> bool {
        self.check_compliance(capability_proof)
            .map(|r| r.iter().all(|c| c.passed))
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceResult {
    pub requirement_id: String,
    pub description: String,
    pub passed: bool,
    pub details: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eidas_framework() {
        let framework = TrustFramework::eidas();
        assert_eq!(framework.standard, FrameworkStandard::Eidas);
        assert_eq!(framework.requirements.len(), 2);
    }

    #[test]
    fn test_compliance_pass() {
        let framework = TrustFramework::eidas();
        let proof = vec![
            "signature_algorithm".into(),
            "key_storage".into(),
            "identity_proofing".into(),
            "document_verification".into(),
        ];
        assert!(framework.is_fully_compliant(&proof));
    }

    #[test]
    fn test_compliance_fail() {
        let framework = TrustFramework::eidas();
        let proof = vec!["signature_algorithm".into()];
        assert!(!framework.is_fully_compliant(&proof));
    }

    #[test]
    fn test_gdpr_framework() {
        let framework = TrustFramework::gdpr();
        assert_eq!(framework.standard, FrameworkStandard::Gdpr);
        assert_eq!(framework.requirements.len(), 2);
    }
}
