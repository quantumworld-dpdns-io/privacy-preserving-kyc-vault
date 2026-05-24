use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KYCTier {
    pub id: String,
    pub name: String,
    pub level: u32,
    pub requirements: Vec<String>,
    pub max_daily_verifications: u64,
    pub max_credit: Option<f64>,
    pub validity_days: u64,
    pub price_usd: f64,
}

impl KYCTier {
    pub fn new(id: String, name: String, level: u32) -> Self {
        Self {
            id,
            name,
            level,
            requirements: Vec::new(),
            max_daily_verifications: 10,
            max_credit: None,
            validity_days: 365,
            price_usd: 0.0,
        }
    }
}

pub fn default_tiers() -> Vec<KYCTier> {
    vec![
        KYCTier {
            id: "tier-1-email".into(),
            name: "Email Verified".into(),
            level: 1,
            requirements: vec!["email_verification".into()],
            max_daily_verifications: 5,
            max_credit: Some(100.0),
            validity_days: 180,
            price_usd: 0.0,
        },
        KYCTier {
            id: "tier-2-basic".into(),
            name: "Basic Identity".into(),
            level: 2,
            requirements: vec!["government_id".into(), "selfie".into()],
            max_daily_verifications: 50,
            max_credit: Some(1000.0),
            validity_days: 365,
            price_usd: 2.99,
        },
        KYCTier {
            id: "tier-3-advanced".into(),
            name: "Advanced Verification".into(),
            level: 3,
            requirements: vec![
                "government_id".into(),
                "selfie".into(),
                "liveness".into(),
                "address_proof".into(),
            ],
            max_daily_verifications: 200,
            max_credit: Some(10000.0),
            validity_days: 365,
            price_usd: 9.99,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_tiers() {
        let tiers = default_tiers();
        assert_eq!(tiers.len(), 3);
        assert_eq!(tiers[0].level, 1);
        assert_eq!(tiers[2].level, 3);
        assert!(tiers[2].price_usd > tiers[0].price_usd);
    }
}
