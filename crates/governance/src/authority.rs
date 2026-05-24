use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum AuthorityError {
    #[error("Node not found: {0}")]
    NodeNotFound(Uuid),
    #[error("Node already registered: {0}")]
    AlreadyRegistered(String),
    #[error("Insufficient authority nodes ({0} < {1})")]
    InsufficientNodes(usize, usize),
    #[error("Invalid rotation: {0}")]
    InvalidRotation(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeStatus {
    Active,
    Inactive,
    Suspended,
    Retired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NodeRole {
    Validator,
    Observer,
    Authority,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorityNode {
    pub id: Uuid,
    pub did: String,
    pub name: String,
    pub endpoint: String,
    pub public_key: String,
    pub role: NodeRole,
    pub status: NodeStatus,
    pub weight: u64,
    pub registered_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthoritySet {
    pub nodes: Vec<AuthorityNode>,
    pub min_nodes: usize,
    pub max_nodes: usize,
    pub epoch: u64,
    pub updated_at: DateTime<Utc>,
}

impl AuthorityNode {
    pub fn new(
        did: &str,
        name: &str,
        endpoint: &str,
        public_key: &str,
        role: NodeRole,
        weight: u64,
        version: &str,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            did: did.to_string(),
            name: name.to_string(),
            endpoint: endpoint.to_string(),
            public_key: public_key.to_string(),
            role,
            status: NodeStatus::Active,
            weight,
            registered_at: Utc::now(),
            last_seen: Utc::now(),
            version: version.to_string(),
        }
    }

    pub fn fingerprint(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.did.as_bytes());
        hasher.update(self.public_key.as_bytes());
        hex::encode(hasher.finalize())
    }
}

impl AuthoritySet {
    pub fn new(min_nodes: usize, max_nodes: usize) -> Self {
        Self {
            nodes: Vec::new(),
            min_nodes,
            max_nodes,
            epoch: 0,
            updated_at: Utc::now(),
        }
    }

    pub fn register(&mut self, node: AuthorityNode) -> Result<(), AuthorityError> {
        if self.nodes.len() >= self.max_nodes {
            return Err(AuthorityError::InvalidRotation("Authority set full".into()));
        }
        if self.nodes.iter().any(|n| n.did == node.did) {
            return Err(AuthorityError::AlreadyRegistered(node.did));
        }
        self.nodes.push(node);
        self.updated_at = Utc::now();
        Ok(())
    }

    pub fn remove(&mut self, node_id: Uuid) -> Result<(), AuthorityError> {
        let pos = self
            .nodes
            .iter()
            .position(|n| n.id == node_id)
            .ok_or(AuthorityError::NodeNotFound(node_id))?;
        if self.nodes.len() <= self.min_nodes {
            return Err(AuthorityError::InsufficientNodes(
                self.nodes.len() - 1,
                self.min_nodes,
            ));
        }
        self.nodes.remove(pos);
        self.updated_at = Utc::now();
        Ok(())
    }

    pub fn rotate(&mut self, old_id: Uuid, new_node: AuthorityNode) -> Result<(), AuthorityError> {
        self.remove(old_id)?;
        self.register(new_node)?;
        self.epoch += 1;
        Ok(())
    }

    pub fn active_count(&self) -> usize {
        self.nodes
            .iter()
            .filter(|n| n.status == NodeStatus::Active)
            .count()
    }

    pub fn total_weight(&self) -> u64 {
        self.nodes
            .iter()
            .filter(|n| n.status == NodeStatus::Active)
            .map(|n| n.weight)
            .sum()
    }

    pub fn supermajority_weight(&self) -> u64 {
        (self.total_weight() * 2) / 3 + 1
    }

    pub fn is_quorum_reached(&self, signed_weight: u64) -> bool {
        let total = self.total_weight();
        if total == 0 {
            return false;
        }
        signed_weight >= (total * 2) / 3 + 1
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_node(did: &str) -> AuthorityNode {
        AuthorityNode::new(
            did,
            "test",
            "https://example.com",
            "pubkey",
            NodeRole::Validator,
            1,
            "1.0.0",
        )
    }

    #[test]
    fn test_register_and_count() {
        let mut set = AuthoritySet::new(1, 10);
        set.register(make_node("did:a")).unwrap();
        set.register(make_node("did:b")).unwrap();
        assert_eq!(set.active_count(), 2);
    }

    #[test]
    fn test_remove_below_minimum_fails() {
        let mut set = AuthoritySet::new(2, 10);
        let n1 = make_node("did:a");
        let n2 = make_node("did:b");
        let id1 = n1.id;
        let id2 = n2.id;
        set.register(n1).unwrap();
        set.register(n2).unwrap();
        set.remove(id1).unwrap();
        assert!(set.remove(id2).is_err());
    }

    #[test]
    fn test_quorum() {
        let mut set = AuthoritySet::new(1, 10);
        set.register(make_node("did:a")).unwrap();
        set.register(make_node("did:b")).unwrap();
        set.register(make_node("did:c")).unwrap();
        assert_eq!(set.supermajority_weight(), 3);
        assert!(set.is_quorum_reached(3));
        assert!(!set.is_quorum_reached(2));
    }

    #[test]
    fn test_rotation() {
        let mut set = AuthoritySet::new(1, 10);
        let old = make_node("did:old");
        let old_id = old.id;
        set.register(old).unwrap();
        let new = make_node("did:new");
        set.rotate(old_id, new).unwrap();
        assert_eq!(set.active_count(), 1);
        assert!(set.nodes.iter().any(|n| n.did == "did:new"));
    }
}
