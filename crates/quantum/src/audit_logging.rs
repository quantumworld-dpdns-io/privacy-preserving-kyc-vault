use crate::crypto_pqc::{self, DilithiumWrapper, KyberWrapper};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use chrono::{Utc, Duration};
use std::collections::HashMap;

/// Quantum-resistant audit logging
pub mod audit_logging {
    use super::*;

    #[derive(Debug, Error)]
    pub enum AuditError {
        #[error("Log entry creation failed")]
        LogCreationFailed,
        
        #[error("Log verification failed")]
        LogVerificationFailed,
        
        #[error("Tampering detected")]
        TamperingDetected,
        
        #[error("Insufficient quantum security")]
        InsufficientSecurity,
        
        #[error("Log storage failed")]
        StorageFailed,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct AuditEntry {
        pub version: String,
        pub timestamp: i64, // Unix timestamp
        pub actor: String,
        pub action: String,
        pub resource: String,
        pub outcome: String,
        pub metadata: serde_json::Value,
        pub previous_hash: Option<String>,
        pub entry_hash: String,
        pub signature: String, // Quantum-safe signature
    }

    #[derive(Debug, Clone)]
    pub struct QuantumAuditLogger {
        pub logger_id: String,
        pub dilithium_wrapper: DilithiumWrapper,
        pub kyber_wrapper: KyberWrapper,
        pub chain: Vec<AuditEntry>,
        pub entropy_source: super::random_number_gen::QRNGService,
    }

    impl QuantumAuditLogger {
        pub fn new(logger_id: String) -> Self {
            Self {
                logger_id: logger_id.clone(),
                dilithium_wrapper: DilithiumWrapper::new(),
                kyber_wrapper: KyberWrapper::new(),
                chain: Vec::new(),
                entropy_source: super::random_number_gen::QRNGService::new(),
            }
        }

        /// Create a new audit entry
        pub fn log_event(
            &mut self,
            actor: &str,
            action: &str,
            resource: &str,
            outcome: &str,
            metadata: Option<serde_json::Value>,
        ) -> Result<(), AuditError> {
            let timestamp = Utc::now().timestamp();
            
            // Get previous hash
            let previous_hash = self.chain.last()
                .map(|entry| entry.entry_hash.clone());
            
            // Create entry without hash and signature
            let mut entry = AuditEntry {
                version: "1.0".to_string(),
                timestamp,
                actor: actor.to_string(),
                action: action.to_string(),
                resource: resource.to_string(),
                outcome: outcome.to_string(),
                metadata: metadata.unwrap_or(serde_json::json!({})),
                previous_hash,
                entry_hash: String::new(),
                signature: String::new(),
            };
            
            // Calculate hash of the entry (excluding signature)
            let hash_input = serde_json::to_string(&entry)
                .map_err(|_| AuditError::LogCreationFailed)?;
            
            // Use quantum-randomized hashing for enhanced security
            let salt = self.entropy_source.generate_key(32)
                .map_err(|_| AuditError::LogCreationFailed)?;
            
            let hash_input_with_salt = format!("{}{}", hash_input, 
                hex::encode(salt));
            
            let entry_hash = super::crypto_pqc::hash::quantum_resistant_hash(
                hash_input_with_salt.as_bytes());
            entry.entry_hash = hex::encode(entry_hash);
            
            // Sign the entry with quantum-safe signature
            let signature = self.dilithium_wrapper.sign(entry.entry_hash.as_bytes())
                .map_err(|_| AuditError::LogCreationFailed)?;
            
            entry.signature = base64::encode(signature);
            
            // Add to chain
            self.chain.push(entry);
            
            Ok(())
        }

        /// Verify the integrity of the audit log
        pub fn verify_chain(&self) -> Result<bool, AuditError> {
            if self.chain.is_empty() {
                return Ok(true); // Empty chain is valid
            }
            
            // Verify each entry
            for (i, entry) in self.chain.iter().enumerate() {
                // Skip genesis block for previous hash check
                let expected_previous_hash = if i == 0 {
                    None
                } else {
                    Some(self.chain[i-1].entry_hash.clone())
                };
                
                if entry.previous_hash != expected_previous_hash {
                    return Err(AuditError::TamperingDetected);
                }
                
                // Verify entry hash
                let mut entry_for_hash = entry.clone();
                entry_for_hash.entry_hash = String::new();
                entry_for_hash.signature = String::new();
                
                let hash_input = serde_json::to_string(&entry_for_hash)
                    .map_err(|_| AuditError::LogVerificationFailed)?;
                
                // Recreate salt from entry metadata (in practice, we'd store this)
                // For simplicity, we're using a deterministic approach based on entry content
                let salt_input = format!("{}{}", hash_input, entry.metadata);
                let salt = super::crypto_pqc::hash::blake3_hash(salt_input.as_bytes());
                
                let hash_input_with_salt = format!("{}{}", hash_input, 
                    hex::encode(&salt[0..32]));
                
                let calculated_hash = super::crypto_pqc::hash::quantum_resistant_hash(
                    hash_input_with_salt.as_bytes());
                let expected_hash = hex::encode(calculated_hash);
                
                if entry.entry_hash != expected_hash {
                    return Err(AuditError::TamperingDetected);
                }
                
                // Verify signature
                let signature = base64::decode(&entry.signature)
                    .map_err(|_| AuditError::LogVerificationFailed)?;
                
                self.dilithium_wrapper.verify(entry.entry_hash.as_bytes(), &signature)
                    .map_err(|_| AuditError::LogVerificationFailed)?;
            }
            
            Ok(true)
        }

        /// Verify a single audit entry
        pub fn verify_entry(&self, entry: &AuditEntry) -> Result<bool, AuditError> {
            // Verify entry hash
            let mut entry_for_hash = entry.clone();
            entry_for_hash.entry_hash = String::new();
            entry_for_hash.signature = String::new();
            
            let hash_input = serde_json::to_string(&entry_for_hash)
                .map_err(|_| AuditError::LogVerificationFailed)?;
            
            // In a real implementation, we would have stored the salt with the entry
            // For this implementation, we'll derive it from the entry content
            let salt_input = format!("{}{}", hash_input, entry.metadata);
            let salt = super::crypto_pqc::hash::blake3_hash(salt_input.as_bytes());
            
            let hash_input_with_salt = format!("{}{}", hash_input, 
                hex::encode(&salt[0..32]));
            
            let calculated_hash = super::crypto_pqc::hash::quantum_resistant_hash(
                hash_input_with_salt.as_bytes());
            let expected_hash = hex::encode(calculated_hash);
            
            if entry.entry_hash != expected_hash {
                return Err(AuditError::TamperingDetected);
            }
            
            // Verify signature
            let signature = base64::decode(&entry.signature)
                .map_err(|_| AuditError::LogVerificationFailed)?;
            
            self.dilithium_wrapper.verify(entry.entry_hash.as_bytes(), &signature)
                .map_err(|_| AuditError::LogVerificationFailed)?;
                
            Ok(true)
        }

        /// Get audit entries by actor
        pub fn get_entries_by_actor(&self, actor: &str) -> Vec<AuditEntry> {
            self.chain.iter()
                .filter(|entry| entry.actor == actor)
                .cloned()
                .collect()
        }

        /// Get audit entries by action
        pub fn get_entries_by_action(&self, action: &str) -> Vec<AuditEntry> {
            self.chain.iter()
                .filter(|entry| entry.action == action)
                .cloned()
                .collect()
        }

        /// Get audit entries by resource
        pub fn get_entries_by_resource(&self, resource: &str) -> Vec<AuditEntry> {
            self.chain.iter()
                .filter(|entry| entry.resource == resource)
                .cloned()
                .collect()
        }

        /// Get audit entries in time range
        pub fn get_entries_by_time_range(&self, start: i64, end: i64) -> Vec<AuditEntry> {
            self.chain.iter()
                .filter(|entry| entry.timestamp >= start && entry.timestamp <= end)
                .cloned()
                .collect()
        }

        /// Export audit log as JSON array
        pub fn export_log(&self) -> Result<String, AuditError> {
            serde_json::to_string(&self.chain)
                .map_err(|_| AuditError::StorageFailed)
        }

        /// Import audit log from JSON array
        pub fn import_log(&mut self, json: &str) -> Result<(), AuditError> {
            let chain: Vec<AuditEntry> = serde_json::from_str(json)
                .map_err(|_| AuditError::StorageFailed)?;
            
            // Verify imported chain before accepting
            let temp_logger = QuantumAuditLogger {
                logger_id: self.logger_id.clone(),
                dilithium_wrapper: self.dilithium_wrapper.clone(),
                kyber_wrapper: self.kyber_wrapper.clone(),
                chain,
                entropy_source: self.entropy_source.clone(),
            };
            
            if !temp_logger.verify_chain()? {
                return Err(AuditError::TamperingDetected);
            }
            
            self.chain = temp_logger.chain;
            Ok(())
        }

        /// Get statistics about the audit log
        pub fn get_statistics(&self) -> AuditStatistics {
            let mut action_counts: HashMap<String, usize> = HashMap::new();
            let mut actor_counts: HashMap<String, usize> = HashMap::new();
            let mut resource_counts: HashMap<String, usize> = HashMap::new();
            let mut outcome_counts: HashMap<String, usize> = HashMap::new();
            
            for entry in &self.chain {
                *action_counts.entry(entry.action.clone()).or_insert(0) += 1;
                *actor_counts.entry(entry.actor.clone()).or_insert(0) += 1;
                *resource_counts.entry(entry.resource.clone()).or_insert(0) += 1;
                *outcome_counts.entry(entry.outcome.clone()).or_insert(0) += 1;
            }
            
            AuditStatistics {
                total_entries: self.chain.len(),
                earliest_entry: self.chain.first().map(|e| e.timestamp),
                latest_entry: self.chain.last().map(|e| e.timestamp),
                action_counts,
                actor_counts,
                resource_counts,
                outcome_counts,
            }
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct AuditStatistics {
        pub total_entries: usize,
        pub earliest_entry: Option<i64>,
        pub latest_entry: Option<i64>,
        pub action_counts: HashMap<String, usize>,
        pub actor_counts: HashMap<String, usize>,
        pub resource_counts: HashMap<String, usize>,
        pub outcome_counts: HashMap<String, usize>,
    }

    /// Quantum-resistant audit log verifier (for external verification)
    pub struct AuditVerifier {
        pub dilithium_wrapper: DilithiumWrapper,
    }

    impl AuditVerifier {
        pub fn new() -> Self {
            Self {
                dilithium_wrapper: DilithiumWrapper::new(),
            }
        }

        /// Verify an exported audit log
        pub fn verify_exported_log(&self, json: &str) -> Result<bool, AuditError> {
            let chain: Vec<AuditEntry> = serde_json::from_str(json)
                .map_err(|_| AuditError::LogVerificationFailed)?;
            
            // Create temporary logger to verify chain
            let temp_logger = QuantumAuditLogger {
                logger_id: "verifier".to_string(),
                dilithium_wrapper: self.dilithium_wrapper.clone(),
                kyber_wrapper: KyberWrapper::new(),
                chain,
                entropy_source: super::random_number_gen::QRNGService::new(),
            };
            
            temp_logger.verify_chain()
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use serde_json::json;

        #[test]
        fn test_audit_logging_basic() {
            let mut logger = QuantumAuditLogger::new("test_logger".to_string());
            
            // Log an event
            let result = logger.log_event(
                "user123",
                "credential_issued",
                "did:example:subject456",
                "success",
                Some(json!({
                    "credential_type": "passport",
                    "issued_by": "government"
                }))
            );
            assert!(result.is_ok());
            
            // Verify the chain
            assert!(logger.verify_chain().is_ok());
            
            # Check that we have one entry
            assert_eq!(logger.chain.len(), 1);
            
            let entry = &logger.chain[0];
            assert_eq!(entry.actor, "user123");
            assert_eq!(entry.action, "credential_issued");
            assert_eq!(entry.resource, "did:example:subject456");
            assert_eq!(entry.outcome, "success");
        }

        #[test]
        fn test_audit_logging_chain_verification() {
            let mut logger = QuantumAuditLogger::new("test_logger".to_string());
            
            // Log multiple events
            logger.log_event("user1", "login", "system", "success", None)
                .expect("Failed to log event");
            logger.log_event("user1", "credential_request", "did:example:subject1", "success", None)
                .expect("Failed to log event");
            logger.log_event("user2", "credential_issue", "did:example:subject2", "success", None)
                .expect("Failed to log event");
            
            // Verify the chain
            assert!(logger.verify_chain().is_ok());
            
            # Check that we have three entries
            assert_eq!(logger.chain.len(), 3);
            
            # Verify hashes chain correctly
            assert_eq!(logger.chain[0].previous_hash, None);
            assert_eq!(logger.chain[1].previous_hash, Some(logger.chain[0].entry_hash.clone()));
            assert_eq!(logger.chain[2].previous_hash, Some(logger.chain[1].entry_hash.clone()));
        }

        #[test]
        fn test_audit_logging_tampering_detection() {
            let mut logger = QuantumAuditLogger::new("test_logger".to_string());
            
            // Log an event
            logger.log_event("user1", "login", "system", "success", None)
                .expect("Failed to log event");
            
            // Tamper with the log
            logger.chain[0].actor = "tampered_user".to_string();
            
            # Verification should fail
            assert!(logger.verify_chain().is_err());
        }

        #[test]
        fn test_audit_logging_export_import() {
            let mut logger = QuantumAuditLogger::new("test_logger".to_string());
            
            # Log some events
            logger.log_event("user1", "action1", "resource1", "outcome1", None)
                .expect("Failed to log event");
            logger.log_event("user2", "action2", "resource2", "outcome2", None)
                .expect("Failed to log event");
            
            # Export the log
            let exported = logger.export_log()
                .expect("Failed to export log");
            
            # Create new logger and import
            let mut new_logger = QuantumAuditLogger::new("new_logger".to_string());
            new_logger.import_log(&exported)
                .expect("Failed to import log");
            
            # Verify the imported chain
            assert!(new_logger.verify_chain().is_ok());
            assert_eq!(new_logger.chain.len(), 2);
        }

        #[test]
        fn test_audit_logging_query() {
            let mut logger = QuantumAuditLogger::new("test_logger".to_string());
            
            # Log events with different actors and actions
            logger.log_event("alice", "login", "system", "success", None)
                .expect("Failed to log event");
            logger.log_event("bob", "login", "system", "success", None)
                .expect("Failed to log event");
            logger.log_event("alice", "credential_issue", "did:example:bob", "success", None)
                .expect("Failed to log event");
            
            # Query by actor
            let alice_entries = logger.get_entries_by_actor("alice");
            assert_eq!(alice_entries.len(), 2);
            assert!(alice_entries.iter().all(|e| e.actor == "alice"));
            
            # Query by action
            let login_entries = logger.get_entries_by_action("login");
            assert_eq!(login_entries.len(), 2);
            assert!(login_entries.iter().all(|e| e.action == "login"));
        }

        #[test]
        fn test_audit_statistics() {
            let mut logger = QuantumAuditLogger::new("test_logger".to_string());
            
            # Log some events
            logger.log_event("user1", "login", "system", "success", None)
                .expect("Failed to log event");
            logger.log_event("user1", "login", "system", "failure", None)
                .expect("Failed to log event");
            logger.log_event("user2", "credential_issue", "did:example:subject1", "success", None)
                .expect("Failed to log event");
            
            let stats = logger.get_statistics();
            assert_eq!(stats.total_entries, 3);
            assert_eq!(stats.action_counts["login"], 2);
            assert_eq!(stats.action_counts["credential_issue"], 1);
            assert_eq!(stats.actor_counts["user1"], 2);
            assert_eq!(stats.actor_counts["user2"], 1);
            assert_eq!(stats.outcome_counts["success"], 2);
            assert_eq!(stats.outcome_counts["failure"], 1);
        }
    }
}