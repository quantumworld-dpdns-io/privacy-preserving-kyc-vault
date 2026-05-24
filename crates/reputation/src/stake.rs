pub struct StakeWeight {
    pub stake_amount: u128,
    pub multiplier: f64,
}

impl StakeWeight {
    pub fn calculate_weight(&self) -> f64 {
        (self.stake_amount as f64).sqrt() * self.multiplier
    }
}
