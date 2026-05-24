use std::collections::HashSet;

pub struct Blacklist {
    entries: HashSet<String>,
}

impl Blacklist {
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

impl Default for Blacklist {
    fn default() -> Self {
        Self::new()
    }
}
