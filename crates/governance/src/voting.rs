use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum VotingError {
    #[error("Proposal not found: {0}")]
    ProposalNotFound(Uuid),
    #[error("Already voted")]
    AlreadyVoted,
    #[error("Voting period ended")]
    VotingPeriodEnded,
    #[error("Insufficient voting power: {0}")]
    InsufficientVotingPower(u64),
    #[error("Proposal already executed")]
    AlreadyExecuted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VoteType {
    Yes,
    No,
    Abstain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProposalStatus {
    Pending,
    Active,
    Passed,
    Rejected,
    Executed,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposal {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub proposer_did: String,
    pub actions: Vec<ProposalAction>,
    pub created_at: DateTime<Utc>,
    pub voting_start: DateTime<Utc>,
    pub voting_end: DateTime<Utc>,
    pub status: ProposalStatus,
    pub quorum: u64,
    pub threshold_bps: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposalAction {
    pub target: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vote {
    pub proposal_id: Uuid,
    pub voter_did: String,
    pub vote: VoteType,
    pub power: u64,
    pub timestamp: DateTime<Utc>,
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteTally {
    pub proposal_id: Uuid,
    pub yes: u64,
    pub no: u64,
    pub abstain: u64,
    pub total: u64,
}

impl Proposal {
    pub fn new(
        title: &str,
        description: &str,
        proposer_did: &str,
        actions: Vec<ProposalAction>,
        voting_start: DateTime<Utc>,
        voting_end: DateTime<Utc>,
        quorum: u64,
        threshold_bps: u64,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            title: title.to_string(),
            description: description.to_string(),
            proposer_did: proposer_did.to_string(),
            actions,
            created_at: Utc::now(),
            voting_start,
            voting_end,
            status: ProposalStatus::Pending,
            quorum,
            threshold_bps,
        }
    }

    pub fn hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.id.to_string().as_bytes());
        hasher.update(self.title.as_bytes());
        hasher.update(self.proposer_did.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn status_at(&self, now: DateTime<Utc>) -> ProposalStatus {
        match self.status {
            ProposalStatus::Executed | ProposalStatus::Expired => self.status.clone(),
            _ if now < self.voting_start => ProposalStatus::Pending,
            _ if now > self.voting_end => ProposalStatus::Expired,
            _ => ProposalStatus::Active,
        }
    }
}

impl Vote {
    pub fn new(proposal_id: Uuid, voter_did: &str, vote: VoteType, power: u64) -> Self {
        Self {
            proposal_id,
            voter_did: voter_did.to_string(),
            vote,
            power,
            timestamp: Utc::now(),
            signature: None,
        }
    }
}

impl VoteTally {
    pub fn new(proposal_id: Uuid) -> Self {
        Self {
            proposal_id,
            yes: 0,
            no: 0,
            abstain: 0,
            total: 0,
        }
    }

    pub fn record(&mut self, vote: &Vote) {
        self.total += vote.power;
        match vote.vote {
            VoteType::Yes => self.yes += vote.power,
            VoteType::No => self.no += vote.power,
            VoteType::Abstain => self.abstain += vote.power,
        }
    }

    pub fn participation_rate(&self, total_voting_power: u64) -> f64 {
        if total_voting_power == 0 {
            return 0.0;
        }
        self.total as f64 / total_voting_power as f64
    }

    pub fn approval_rate(&self) -> f64 {
        let cast = self.yes + self.no;
        if cast == 0 {
            return 0.0;
        }
        self.yes as f64 / cast as f64
    }

    pub fn meets_threshold(&self, quorum: u64, total_power: u64, threshold_bps: u64) -> bool {
        if self.total < quorum.min(total_power) {
            return false;
        }
        let cast = self.yes + self.no;
        if cast == 0 {
            return false;
        }
        let approval_bps = (self.yes as f64 / cast as f64 * 10_000.0) as u64;
        approval_bps >= threshold_bps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proposal_creation() {
        let start = Utc::now();
        let end = start + chrono::Duration::days(7);
        let proposal = Proposal::new(
            "Test Proposal",
            "Test description",
            "did:example:proposer",
            vec![],
            start,
            end,
            100,
            5100,
        );
        assert_eq!(proposal.status_at(Utc::now()), ProposalStatus::Active);
    }

    #[test]
    fn test_vote_tally() {
        let pid = Uuid::new_v4();
        let mut tally = VoteTally::new(pid);
        let v1 = Vote::new(pid, "did:a", VoteType::Yes, 100);
        let v2 = Vote::new(pid, "did:b", VoteType::No, 50);
        tally.record(&v1);
        tally.record(&v2);
        assert_eq!(tally.yes, 100);
        assert_eq!(tally.no, 50);
        assert_eq!(tally.total, 150);
        assert!((tally.approval_rate() - 2.0 / 3.0).abs() < 0.001);
    }

    #[test]
    fn test_threshold_met() {
        let pid = Uuid::new_v4();
        let mut tally = VoteTally::new(pid);
        tally.record(&Vote::new(pid, "did:a", VoteType::Yes, 80));
        tally.record(&Vote::new(pid, "did:b", VoteType::Yes, 20));
        assert!(tally.meets_threshold(50, 200, 5000));
    }

    #[test]
    fn test_threshold_not_met() {
        let pid = Uuid::new_v4();
        let mut tally = VoteTally::new(pid);
        tally.record(&Vote::new(pid, "did:a", VoteType::Yes, 30));
        tally.record(&Vote::new(pid, "did:b", VoteType::No, 70));
        assert!(!tally.meets_threshold(50, 200, 5000));
    }
}
