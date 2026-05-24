use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RevocationList {
    pub id: String,
    #[serde(rename = "type")]
    pub list_type: String,
    pub issuer: String,
    pub issued: String,
    pub revoked_indices: Vec<u64>,
    pub total_bits: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BitstringStatusList {
    pub id: String,
    #[serde(rename = "type")]
    pub list_type: String,
    pub encoded_list: String,
    pub size: u64,
}

impl RevocationList {
    pub fn new(id: String, issuer: String, total_bits: u64) -> Self {
        Self {
            id,
            list_type: "RevocationList2021".into(),
            issuer,
            issued: chrono::Utc::now().to_rfc3339(),
            revoked_indices: Vec::new(),
            total_bits,
        }
    }

    pub fn revoke(&mut self, index: u64) {
        if !self.revoked_indices.contains(&index) {
            self.revoked_indices.push(index);
            self.revoked_indices.sort();
        }
    }

    pub fn is_revoked(&self, index: u64) -> bool {
        self.revoked_indices.contains(&index)
    }

    pub fn unrevoke(&mut self, index: u64) {
        self.revoked_indices.retain(|&i| i != index);
    }
}

pub struct StatusManager {
    lists: HashMap<String, RevocationList>,
}

impl StatusManager {
    pub fn new() -> Self {
        Self {
            lists: HashMap::new(),
        }
    }

    pub fn create_list(&mut self, id: String, issuer: String, total_bits: u64) {
        self.lists
            .insert(id.clone(), RevocationList::new(id, issuer, total_bits));
    }

    pub fn revoke_credential(&mut self, list_id: &str, index: u64) -> Result<(), String> {
        self.lists
            .get_mut(list_id)
            .ok_or_else(|| format!("List not found: {}", list_id))
            .map(|list| list.revoke(index))
    }

    pub fn check_status(&self, list_id: &str, index: u64) -> Result<bool, String> {
        self.lists
            .get(list_id)
            .ok_or_else(|| format!("List not found: {}", list_id))
            .map(|list| list.is_revoked(index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_revocation_list() {
        let mut list = RevocationList::new("urn:uuid:list-1".into(), "did:example:issuer".into(), 1000);

        assert!(!list.is_revoked(42));
        list.revoke(42);
        assert!(list.is_revoked(42));
        list.unrevoke(42);
        assert!(!list.is_revoked(42));
    }

    #[test]
    fn test_status_manager() {
        let mut manager = StatusManager::new();
        manager.create_list("list-1".into(), "did:example:issuer".into(), 1000);

        manager.revoke_credential("list-1", 7).unwrap();
        assert!(manager.check_status("list-1", 7).unwrap());
        assert!(!manager.check_status("list-1", 8).unwrap());
    }
}
