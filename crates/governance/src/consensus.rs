use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum ConsensusError {
    #[error("Not enough validators: {0}")]
    NotEnoughValidators(usize),
    #[error("Message validation failed: {0}")]
    ValidationFailed(String),
    #[error("Timeout expired")]
    TimeoutExpired,
    #[error("View change needed")]
    ViewChangeNeeded,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConsensusMessageType {
    Prepare,
    PreCommit,
    Commit,
    ViewChange,
    NewView,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusMessage {
    pub id: Uuid,
    pub message_type: ConsensusMessageType,
    pub sender_did: String,
    pub sequence_number: u64,
    pub view_number: u64,
    pub payload: Vec<u8>,
    pub signature: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusState {
    pub current_view: u64,
    pub sequence_number: u64,
    pub prepared: bool,
    pub committed: bool,
    pub validator_count: usize,
    pub prepare_count: usize,
    pub precommit_count: usize,
    pub commit_count: usize,
    pub last_message_time: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub height: u64,
    pub hash: String,
    pub parent_hash: String,
    pub proposer_did: String,
    pub transactions: Vec<Vec<u8>>,
    pub timestamp: DateTime<Utc>,
    pub signature: Option<String>,
}

impl ConsensusMessage {
    pub fn new(
        message_type: ConsensusMessageType,
        sender_did: &str,
        sequence_number: u64,
        view_number: u64,
        payload: Vec<u8>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            message_type,
            sender_did: sender_did.to_string(),
            sequence_number,
            view_number,
            payload,
            signature: None,
            timestamp: Utc::now(),
        }
    }

    pub fn hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.id.to_string().as_bytes());
        hasher.update(self.sender_did.as_bytes());
        hasher.update(&self.sequence_number.to_le_bytes());
        hasher.update(&self.payload);
        hex::encode(hasher.finalize())
    }
}

impl ConsensusState {
    pub fn new(validator_count: usize) -> Self {
        Self {
            current_view: 0,
            sequence_number: 0,
            prepared: false,
            committed: false,
            validator_count,
            prepare_count: 0,
            precommit_count: 0,
            commit_count: 0,
            last_message_time: Utc::now(),
        }
    }

    pub fn quorum_size(&self) -> usize {
        (self.validator_count * 2) / 3 + 1
    }

    pub fn on_message(&mut self, msg: &ConsensusMessage) {
        self.last_message_time = Utc::now();
        match msg.message_type {
            ConsensusMessageType::Prepare => self.prepare_count += 1,
            ConsensusMessageType::PreCommit => self.precommit_count += 1,
            ConsensusMessageType::Commit => self.commit_count += 1,
            ConsensusMessageType::ViewChange => {
                self.current_view += 1;
                self.reset_round();
            }
            ConsensusMessageType::NewView => {
                self.reset_round();
            }
        }
        self.check_phase();
    }

    fn check_phase(&mut self) {
        let quorum = self.quorum_size();
        if self.prepare_count >= quorum && !self.prepared {
            self.prepared = true;
        }
        if self.precommit_count >= quorum && self.prepared {
            self.committed = true;
        }
    }

    fn reset_round(&mut self) {
        self.prepared = false;
        self.committed = false;
        self.prepare_count = 0;
        self.precommit_count = 0;
        self.commit_count = 0;
    }

    pub fn is_fault_tolerant(&self) -> bool {
        self.validator_count >= 4
    }

    pub fn max_byzantine(&self) -> usize {
        if self.validator_count == 0 {
            return 0;
        }
        (self.validator_count - 1) / 3
    }
}

impl Block {
    pub fn new(
        height: u64,
        parent_hash: &str,
        proposer_did: &str,
        transactions: Vec<Vec<u8>>,
    ) -> Self {
        let mut block = Self {
            height,
            hash: String::new(),
            parent_hash: parent_hash.to_string(),
            proposer_did: proposer_did.to_string(),
            transactions,
            timestamp: Utc::now(),
            signature: None,
        };
        block.hash = block.compute_hash();
        block
    }

    pub fn compute_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(&self.height.to_le_bytes());
        hasher.update(self.parent_hash.as_bytes());
        hasher.update(self.proposer_did.as_bytes());
        for tx in &self.transactions {
            hasher.update(tx);
        }
        hex::encode(hasher.finalize())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_consensus_quorum() {
        let state = ConsensusState::new(7);
        assert_eq!(state.quorum_size(), 5);
        assert_eq!(state.max_byzantine(), 2);
        assert!(state.is_fault_tolerant());
    }

    #[test]
    fn test_consensus_phase_transition() {
        let mut state = ConsensusState::new(4);
        let q = state.quorum_size();
        for i in 0..q {
            let msg = ConsensusMessage::new(
                ConsensusMessageType::Prepare,
                &format!("did:val:{}", i),
                1,
                0,
                vec![],
            );
            state.on_message(&msg);
        }
        assert!(state.prepared);
    }

    #[test]
    fn test_block_hash() {
        let block = Block::new(1, "parent_hash", "did:proposer", vec![vec![1, 2, 3]]);
        assert!(!block.hash.is_empty());
        assert_eq!(block.hash.len(), 64);
    }

    #[test]
    fn test_small_validator_set() {
        let state = ConsensusState::new(1);
        assert_eq!(state.max_byzantine(), 0);
        assert!(!state.is_fault_tolerant());
    }
}
