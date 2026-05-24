use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum JurisdictionError {
    #[error("Unsupported jurisdiction: {0}")]
    Unsupported(String),
    #[error("Rule not found: {0}")]
    RuleNotFound(String),
    #[error("Jurisdiction conflict")]
    JurisdictionConflict,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum JurisdictionCode {
    EU,
    US,
    UK,
    CH,
    SG,
    JP,
    AU,
    CA,
    Other(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Jurisdiction {
    pub id: Uuid,
    pub code: JurisdictionCode,
    pub name: String,
    pub rules: Vec<JurisdictionRule>,
    pub kyc_requirements: Vec<String>,
    pub data_retention_days: u32,
    pub requires_consent: bool,
    pub requires_data_localization: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JurisdictionRule {
    pub id: String,
    pub description: String,
    pub rule_type: RuleType,
    pub value: serde_json::Value,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuleType {
    MinAge,
    MaxKycTier,
    RequiredDocuments,
    VerificationLevel,
    DataRetention,
    ConsentRequired,
    LocalizationRequired,
    SanctionsCheck,
}

impl Jurisdiction {
    pub fn new(
        code: JurisdictionCode,
        name: &str,
        rules: Vec<JurisdictionRule>,
        kyc_requirements: Vec<String>,
        data_retention_days: u32,
        requires_consent: bool,
        requires_data_localization: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            code,
            name: name.to_string(),
            rules,
            kyc_requirements,
            data_retention_days,
            requires_consent,
            requires_data_localization,
        }
    }

    pub fn eu() -> Self {
        Self::new(
            JurisdictionCode::EU,
            "European Union",
            vec![
                JurisdictionRule {
                    id: "eu-gdpr-1".into(),
                    description: "GDPR data protection".into(),
                    rule_type: RuleType::ConsentRequired,
                    value: serde_json::json!(true),
                    is_active: true,
                },
                JurisdictionRule {
                    id: "eu-aml-1".into(),
                    description: "AML Directive compliance".into(),
                    rule_type: RuleType::VerificationLevel,
                    value: serde_json::json!("high"),
                    is_active: true,
                },
            ],
            vec![
                "government_id".into(),
                "proof_of_address".into(),
                "selfie_verification".into(),
            ],
            365,
            true,
            false,
        )
    }

    pub fn us() -> Self {
        Self::new(
            JurisdictionCode::US,
            "United States",
            vec![
                JurisdictionRule {
                    id: "us-finCEN-1".into(),
                    description: "FinCEN KYC rules".into(),
                    rule_type: RuleType::RequiredDocuments,
                    value: serde_json::json!(["ssn", "drivers_license", "utility_bill"]),
                    is_active: true,
                },
                JurisdictionRule {
                    id: "us-ofac-1".into(),
                    description: "OFAC sanctions check".into(),
                    rule_type: RuleType::SanctionsCheck,
                    value: serde_json::json!(true),
                    is_active: true,
                },
            ],
            vec![
                "ssn_or_tin".into(),
                "government_id".into(),
                "proof_of_address".into(),
            ],
            1825,
            false,
            true,
        )
    }

    pub fn get_rule(&self, rule_id: &str) -> Option<&JurisdictionRule> {
        self.rules.iter().find(|r| r.id == rule_id)
    }

    pub fn evaluate_rules(&self, subject: &serde_json::Value) -> Vec<RuleEvaluation> {
        self.rules
            .iter()
            .map(|rule| {
                let passed = match rule.rule_type {
                    RuleType::MinAge => subject
                        .get("age")
                        .and_then(|a| a.as_u64())
                        .map(|age| age >= rule.value.as_u64().unwrap_or(0))
                        .unwrap_or(false),
                    RuleType::SanctionsCheck => true,
                    RuleType::ConsentRequired => subject
                        .get("consent_given")
                        .and_then(|c| c.as_bool())
                        .unwrap_or(false)
                        == rule.value.as_bool().unwrap_or(false),
                    _ => true,
                };
                RuleEvaluation {
                    rule_id: rule.id.clone(),
                    description: rule.description.clone(),
                    passed,
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleEvaluation {
    pub rule_id: String,
    pub description: String,
    pub passed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_eu_jurisdiction() {
        let eu = Jurisdiction::eu();
        assert_eq!(eu.code, JurisdictionCode::EU);
        assert!(eu.requires_consent);
        assert_eq!(eu.kyc_requirements.len(), 3);
    }

    #[test]
    fn test_us_jurisdiction() {
        let us = Jurisdiction::us();
        assert_eq!(us.code, JurisdictionCode::US);
        assert!(us.requires_data_localization);
    }

    #[test]
    fn test_rule_evaluation() {
        let eu = Jurisdiction::eu();
        let subject = serde_json::json!({"consent_given": true, "age": 25});
        let results = eu.evaluate_rules(&subject);
        assert!(results.len() >= 1);
        let consent_result = results.iter().find(|r| r.rule_id == "eu-gdpr-1");
        assert!(consent_result.is_some());
        assert!(consent_result.unwrap().passed);
    }
}
