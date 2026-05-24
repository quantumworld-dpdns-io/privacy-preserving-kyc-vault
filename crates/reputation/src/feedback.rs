pub struct Feedback {
    pub rater_did: String,
    pub target_did: String,
    pub rating: f64, // 0.0 to 1.0
    pub timestamp: i64,
}
