pub mod authority;
pub mod audit_trail;
pub mod consensus;
pub mod did_governance;
pub mod jurisdiction;
pub mod revocation;
pub mod trust_framework;
pub mod upgrade;
pub mod voting;

pub use authority::AuthorityNode;
pub use audit_trail::AuditEvent;
pub use consensus::ConsensusMessage;
pub use did_governance::{GovernanceRule, TrustRegistry};
pub use jurisdiction::Jurisdiction;
pub use revocation::RevocationRegistry;
pub use trust_framework::TrustFramework;
pub use upgrade::ProtocolUpgrade;
pub use voting::{Proposal, Vote};
