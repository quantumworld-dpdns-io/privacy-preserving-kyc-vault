use std::collections::HashSet;

pub struct Whitelist {
    entries: HashSet<String>,
}

impl Whitelist {
    pub fn new() -> Self {
        Self {
            entries: HashSet::new(),
        }
    }

    pub fn add(&mut self, did: String) {
        self.entries.insert(did);
    }

    pub fn contains(&self, did: &str) -> bool {
        self.entries.contains(did)
    }
}

impl Default for Whitelist {
    fn default() -> Self {
        Self::new()
    }
}
