use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYCDecision {
    pub workflow_id: String,
    pub decision: Decision,
    pub confidence: f64,
    pub reasons: Vec<String>,
    pub evidence_hashes: Vec<String>,
    pub made_by: DecisionMaker,
    pub decided_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Decision {
    Approve,
    Reject,
    FlagForReview,
    RequestMoreInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DecisionMaker {
    Automated,
    HumanReviewer(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionRules {
    pub auto_approve_threshold: f64,
    pub auto_reject_threshold: f64,
    pub require_human_review: Vec<String>,
    pub max_risk_score: f64,
}

impl DecisionRules {
    pub fn default() -> Self {
        Self {
            auto_approve_threshold: 0.85,
            auto_reject_threshold: 0.3,
            require_human_review: vec!["sanctions_hit".into(), "high_risk_country".into()],
            max_risk_score: 100.0,
        }
    }

    pub fn evaluate(&self, risk_score: f64, flags: &[String]) -> KYCDecision {
        let has_flags = flags.iter().any(|f| self.require_human_review.contains(f));

        if has_flags {
            return KYCDecision {
                workflow_id: String::new(),
                decision: Decision::FlagForReview,
                confidence: risk_score / 100.0,
                reasons: vec!["Flagged for human review".into()],
                evidence_hashes: Vec::new(),
                made_by: DecisionMaker::Automated,
                decided_at: chrono::Utc::now().to_rfc3339(),
            };
        }

        if risk_score >= self.auto_approve_threshold * 100.0 {
            KYCDecision {
                workflow_id: String::new(),
                decision: Decision::Approve,
                confidence: risk_score / 100.0,
                reasons: vec!["Auto-approved".into()],
                evidence_hashes: Vec::new(),
                made_by: DecisionMaker::Automated,
                decided_at: chrono::Utc::now().to_rfc3339(),
            }
        } else if risk_score <= self.auto_reject_threshold * 100.0 {
            KYCDecision {
                workflow_id: String::new(),
                decision: Decision::Reject,
                confidence: 1.0 - (risk_score / 100.0),
                reasons: vec!["Risk score too low".into()],
                evidence_hashes: Vec::new(),
                made_by: DecisionMaker::Automated,
                decided_at: chrono::Utc::now().to_rfc3339(),
            }
        } else {
            KYCDecision {
                workflow_id: String::new(),
                decision: Decision::FlagForReview,
                confidence: risk_score / 100.0,
                reasons: vec!["Score in review range".into()],
                evidence_hashes: Vec::new(),
                made_by: DecisionMaker::Automated,
                decided_at: chrono::Utc::now().to_rfc3339(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_approve() {
        let rules = DecisionRules::default();
        let decision = rules.evaluate(95.0, &[]);
        assert_eq!(decision.decision, Decision::Approve);
        assert_eq!(decision.made_by, DecisionMaker::Automated);
    }

    #[test]
    fn test_auto_reject() {
        let rules = DecisionRules::default();
        let decision = rules.evaluate(10.0, &[]);
        assert_eq!(decision.decision, Decision::Reject);
    }

    #[test]
    fn test_flag_for_review() {
        let rules = DecisionRules::default();
        let decision = rules.evaluate(60.0, &[]);
        assert_eq!(decision.decision, Decision::FlagForReview);
    }

    #[test]
    fn test_sanctions_hit_flags_for_review() {
        let rules = DecisionRules::default();
        let decision = rules.evaluate(95.0, &["sanctions_hit".into()]);
        assert_eq!(decision.decision, Decision::FlagForReview);
    }
}
