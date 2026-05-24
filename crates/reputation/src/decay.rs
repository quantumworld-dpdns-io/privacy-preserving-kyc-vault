pub struct DecayFunction {
    pub half_life_days: f64,
}

impl DecayFunction {
    pub fn apply(&self, score: f64, age_seconds: i64) -> f64 {
        let age_days = age_seconds as f64 / 86400.0;
        score * (0.5f64).powf(age_days / self.half_life_days)
    }
}
