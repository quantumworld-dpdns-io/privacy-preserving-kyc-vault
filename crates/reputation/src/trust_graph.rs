use std::collections::HashMap;

pub struct TrustGraph {
    edges: HashMap<String, HashMap<String, f64>>,
}

impl TrustGraph {
    pub fn new() -> Self {
        Self {
            edges: HashMap::new(),
        }
    }

    pub fn set_trust(&mut self, from: String, to: String, weight: f64) {
        self.edges.entry(from).or_insert_with(HashMap::new).insert(to, weight);
    }

    pub fn get_trust(&self, from: &str, to: &str) -> f64 {
        self.edges.get(from).and_then(|m| m.get(to)).cloned().unwrap_or(0.0)
    }
}

impl Default for TrustGraph {
    fn default() -> Self {
        Self::new()
    }
}
