pub struct SybilResistance {
    pub proof_of_personhood: bool,
    pub account_age_days: i32,
}

impl SybilResistance {
    pub fn get_score(&self) -> f64 {
        let mut score = if self.proof_of_personhood { 0.8 } else { 0.1 };
        score += (self.account_age_days as f64 / 365.0).min(0.2);
        score
    }
}
