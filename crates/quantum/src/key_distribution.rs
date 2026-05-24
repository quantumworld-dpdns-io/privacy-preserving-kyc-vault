use thiserror::Error;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::collections::HashMap;

/// Quantum key distribution simulation and protocols
pub mod key_distribution {
    use super::*;

    #[derive(Debug, Error)]
    pub enum QKDError {
        #[error("Quantum channel error")]
        ChannelError,
        
        #[error("Authentication failed")]
        AuthenticationFailed,
        
        #[error("Key reconciliation failed")]
        ReconciliationFailed,
        
        #[error("Privacy amplification failed")]
        PrivacyAmplificationFailed,
        
        #[error("Eavesdropping detected")]
        EavesdroppingDetected,
        
        #[error("Protocol error: {0}")]
        ProtocolError(String),
    }

    /// BB84 protocol implementation
    pub struct BB84 {
        // In a real implementation, this would have quantum channel parameters
        security_parameter: f64,
    }

    impl BB84 {
        pub fn new() -> Self {
            Self {
                security_parameter: 0.1, // 10% error tolerance
            }
        }

        /// Simulate sending qubits using BB84 encoding
        pub fn prepare_qubits(&self, key_bits: &[bool]) -> Vec<(bool, bool)> {
            // Each tuple represents (bit_value, basis_choice)
            // basis: false = Z basis (rectilinear), true = X basis (diagonal)
            let mut rng = StdRng::from_entropy();
            key_bits.iter()
                .map(|&bit| {
                    let basis = rng.gen::<bool>(); // Random basis choice
                    (bit, basis)
                })
                .collect()
        }

        /// Simulate measurement in random bases
        pub fn measure_qubits(&self, prepared: &[(bool, bool)]) -> Vec<(bool, bool)> {
            // Each tuple represents (measured_bit, measurement_basis)
            let mut rng = StdRng::from_entropy();
            prepared.iter()
                .map(|&(bit, preparation_basis)| {
                    let measurement_basis = rng.gen::<bool>(); // Random measurement basis
                    
                    // If bases match, we get the correct bit
                    // If bases don't match, we get a random bit
                    let measured_bit = if preparation_basis == measurement_basis {
                        bit
                    } else {
                        rng.gen::<bool>() // Random bit when bases don't match
                    };
                    
                    (measured_bit, measurement_basis)
                })
                .collect()
        }

        /// Perform sifting to keep only matching basis results
        pub fn sift_key(
            &self,
            alice_prepared: &[(bool, bool)],
            bob_measured: &[(bool, bool)],
        ) -> (Vec<bool>, Vec<bool>) {
            let mut alice_key = Vec::new();
            let mut bob_key = Vec::new();
            
            for ((a_bit, a_basis), &(b_bit, b_basis)) in 
                alice_prepared.iter().zip(bob_measured.iter()) {
                if a_basis == b_basis {
                    // Bases match, keep the bit
                    alice_key.push(*a_bit);
                    bob_key.push(b_bit);
                }
            }
            
            (alice_key, bob_key)
        }

        /// Estimate error rate by comparing a subset of the key
        pub fn estimate_error_rate(
            &self,
            alice_key: &[bool],
            bob_key: &[bool],
            sample_fraction: f64,
        ) -> Result<f64, QKDError> {
            if alice_key.len() != bob_key.len() {
                return Err(QKDError::ProtocolError(
                    "Key lengths must match for error estimation".to_string()
                ));
            }
            
            if alice_key.is_empty() {
                return Err(QKDError::ProtocolError(
                    "Keys must not be empty".to_string()
                ));
            }
            
            let sample_size = (alice_key.len() as f64 * sample_fraction).round() as usize;
            let sample_size = std::cmp::max(1, std::cmp::min(sample_size, alice_key.len()));
            
            let mut errors = 0;
            let mut indices = Vec::new();
            
            // Simple deterministic sampling for simulation
            let step = alice_key.len() / sample_size;
            for i in (0..alice_key.len()).step_by(step.max(1)) {
                if indices.len() >= sample_size { break; }
                indices.push(i);
            }
            
            for &idx in &indices {
                if alice_key[idx] != bob_key[idx] {
                    errors += 1;
                }
            }
            
            let error_rate = errors as f64 / sample_size as f64;
            
            if error_rate > self.security_parameter {
                Err(QKDError::EavesdroppingDetected)
            } else {
                Ok(error_rate)
            }
        }

        /// Perform information reconciliation using Cascade protocol (simplified)
        pub fn reconcile_keys(
            &self,
            alice_key: &[bool],
            bob_key: &[bool],
            error_rate: f64,
        ) -> Result<Vec<bool>, QKDError> {
            if alice_key.len() != bob_key.len() {
                return Err(QKDError::ProtocolError(
                    "Key lengths must match for reconciliation".to_string()
                ));
            }
            
            // Simple reconciliation: Alice's key is considered correct
            // In reality, this would involve multiple rounds of error correction
            let mut reconciled = Vec::with_capacity(alice_key.len());
            
            // For simulation, we'll assume Bob can correct errors based on estimated error rate
            // In practice, this requires communication between Alice and Bob
            let mut bob_key_corrected = bob_key.to_vec();
            
            // Simple error correction simulation
            let expected_errors = (bob_key.len() as f64 * error_rate) as usize;
            let mut errors_found = 0;
            
            for i in 0..bob_key.len() {
                // Simulate finding and correcting errors
                if errors_found < expected_errors && bob_key[i] != alice_key[i] {
                    bob_key_corrected[i] = alice_key[i]; // Correct the error
                    errors_found += 1;
                }
                reconciled.push(bob_key_corrected[i]);
            }
            
            Ok(reconciled)
        }

        /// Perform privacy amplification using universal hashing (simplified)
        pub fn amplify_privacy(
            &self,
            key: &[bool],
            error_rate: f64,
        ) -> Vec<bool> {
            // Calculate how much to compress the key based on error rate
            // Using simplified formula: final_length = original_length * (1 - h(error_rate))
            // where h(p) is the binary entropy function
            let entropy = Self::binary_entropy(error_rate);
            let compression_factor = 1.0 - entropy;
            let final_length = (key.len() as f64 * compression_factor).round() as usize;
            
            // For simulation, we'll just take a subset of the key
            // In reality, this would use a universal hash function
            let mut amplified = Vec::with_capacity(final_length);
            let step = std::cmp::max(1, key.len() / final_length);
            
            for i in (0..key.len()).step_by(step) {
                if amplified.len() >= final_length { break; }
                amplified.push(key[i]);
            }
            
            amplified
        }

        fn binary_entropy(p: f64) -> f64 {
            if p <= 0.0 || p >= 1.0 {
                return 0.0;
            }
            -p * p.log2() - (1.0 - p) * (1.0 - p).log2()
        }

        /// Run the complete BB84 protocol
        pub fn run_protocol(
            &self,
            key_length: usize,
        ) -> Result<Vec<bool>, QKDError> {
            // Step 1: Alice generates random key
            let mut rng = StdRng::from_entropy();
            let alice_key: Vec<bool> = (0..key_length)
                .map(|_| rng.gen())
                .collect();
            
            // Step 2: Alice prepares qubits
            let alice_prepared = self.prepare_qubits(&alice_key);
            
            // Step 3: Bob measures qubits
            let bob_measured = self.measure_qubits(&alice_prepared);
            
            // Step 4: Sifting
            let (sifted_alice, sifted_bob) = self.sift_key(&alice_prepared, &bob_measured);
            
            // Check if we have enough key material
            if sifted_alice.len() < 10 {
                return Err(QKDError::ProtocolError(
                    "Insufficient key material after sifting".to_string()
                ));
            }
            
            // Step 5: Error estimation
            let error_rate = self.estimate_error_rate(&sifted_alice, &sifted_bob, 0.2)?;
            
            // Step 6: Information reconciliation
            let reconciled_key = self.reconcile_keys(&sifted_alice, &sifted_bob, error_rate)?;
            
            // Step 7: Privacy amplification
            let final_key = self.amplify_privacy(&reconciled_key, error_rate);
            
            Ok(final_key)
        }
    }

    /// E91 protocol (entanglement-based QKD) simulation
    pub struct E91;

    impl E91 {
        pub fn new() -> Self {
            Self
        }

        /// Simulate entangled pair generation and measurement
        pub fn run_protocol(
            &self,
            key_length: usize,
        ) -> Result<Vec<bool>, QKDError> {
            // Simplified E91 protocol simulation
            // In reality, this would involve generating entangled pairs,
            // distributing them to Alice and Bob, and measuring in random bases
            
            // For simulation, we'll generate correlated keys with some noise
            let mut rng = StdRng::from_entropy();
            let mut alice_key = Vec::with_capacity(key_length);
            let mut bob_key = Vec::with_capacity(key_length);
            
            // Generate correlated bits with 15% error rate (simulating channel noise)
            for _ in 0..key_length {
                let bit = rng.gen::<bool>();
                let error = rng.gen_bool(0.15); // 15% chance of error
                
                alice_key.push(bit);
                bob_key.push(if error { !bit } else { bit });
            }
            
            // Perform error correction and privacy amplification (simplified)
            let error_rate = 0.15;
            let bb84 = BB84::new();
            let reconciled = bb84.reconcile_keys(&alice_key, &bob_key, error_rate)?;
            let final_key = bb84.amplify_privacy(&reconciled, error_rate);
            
            Ok(final_key)
        }
    }

    /// Device-independent QKD protocol simulation
    pub struct DeviceIndependentQKD;

    impl DeviceIndependentQKD {
        pub fn new() -> Self {
            Self
        }

        /// Run device-independent QKD protocol
        pub fn run_protocol(
            &self,
            key_length: usize,
            chsh_threshold: f64,
        ) -> Result<Vec<bool>, QKDError> {
            // Simplified device-independent QKD
            // In reality, this would violate Bell's inequality to guarantee security
            
            let mut rng = StdRng::from_entropy();
            
            // Generate measurement settings and outcomes
            let mut alice_settings = Vec::with_capacity(key_length);
            let mut bob_settings = Vec::with_capacity(key_length);
            let mut alice_outcomes = Vec::with_capacity(key_length);
            let mut bob_outcomes = Vec::with_capacity(key_length);
            
            // Generate random settings (0 or 1) for each party
            for _ in 0..key_length {
                alice_settings.push(rng.gen::<bool>());
                bob_settings.push(rng.gen::<bool>());
                
                // Simulate outcomes with some correlation
                // In a real DIQKD, this would come from quantum measurements
                let mut outcome = rng.gen::<bool>();
                
                // Introduce correlation based on settings (simulating entanglement)
                if alice_settings.last().unwrap() == bob_settings.last().unwrap() {
                    // Same settings: highly correlated
                    if rng.gen_bool(0.8) { // 80% correlation
                        outcome = !*alice_settings.last().unwrap();
                    }
                } else {
                    // Different settings: anti-correlated
                    if rng.gen_bool(0.8) { // 80% anti-correlation
                        outcome = *alice_settings.last().unwrap();
                    }
                }
                
                alice_outcomes.push(outcome);
                // Bob's outcome is correlated with Alice's
                let bob_outcome = if rng.gen_bool(0.7) { // 70% correlation
                    !outcome
                } else {
                    outcome
                };
                bob_outcomes.push(bob_outcome);
            }
            
            // Calculate CHSH value (simplified)
            let chsh_value = self.calculate_chsh(
                &alice_settings, &bob_settings,
                &alice_outcomes, &bob_outcomes
            );
            
            // Check if CHSH violation is sufficient for security
            if chsh_value < chsh_threshold {
                return Err(QKDError::ProtocolError(
                    format!("Insufficient CHSH violation: {}", chsh_value)
                ));
            }
            
            // Generate key from outcomes (simplified)
            let mut key = Vec::with_capacity(key_length / 2); // Compress for security
            for i in (0..key_length).step_by(2) {
                if i + 1 < key_length {
                    key.push(alice_outcomes[i] != alice_outcomes[i+1]);
                }
            }
            
            Ok(key)
        }
        
        fn calculate_chsh(
            &self,
            alice_settings: &[bool],
            bob_settings: &[bool],
            alice_outcomes: &[bool],
            bob_outcomes: &[bool],
        ) -> f64 {
            // Simplified CHSH calculation
            // In reality, this would correlate measurement settings and outcomes
            // to compute the CHSH inequality value
            
            let mut count = [0; 4]; // [A0B0, A0B1, A1B0, A1B1]
            let mut total = [0; 4];
            
            for i in 0..alice_settings.len() {
                let a_idx = if alice_settings[i] { 1 } else { 0 };
                let b_idx = if bob_settings[i] { 1 } else { 0 };
                let idx = a_idx * 2 + b_idx;
                
                total[idx] += 1;
                
                // Convert bool to +/-1 for correlation calculation
                let a_val = if alice_outcomes[i] { 1 } else { -1 };
                let b_val = if bob_outcomes[i] { 1 } else { -1 };
                
                if a_val * b_val == -1 { // Different outcomes contribute to CHSH
                    count[idx] += 1;
                }
            }
            
            // Calculate CHSH value: E(A0,B0) - E(A0,B1) + E(A1,B0) + E(A1,B1)
            // where E(Ax,By) = P(same) - P(different) = 1 - 2*P(different)
            let mut chsh = 0.0;
            if total[0] > 0 {
                chsh -= (1.0 - 2.0 * count[0] as f64 / total[0] as f64);
            }
            if total[1] > 0 {
                chsh += (1.0 - 2.0 * count[1] as f64 / total[1] as f64);
            }
            if total[2] > 0 {
                chsh += (1.0 - 2.0 * count[2] as f64 / total[2] as f64);
            }
            if total[3] > 0 {
                chsh += (1.0 - 2.0 * count[3] as f64 / total[3] as f64);
            }
            
            chsh.abs()
        }
    }

    /// QKD service interface
    pub struct QKDService {
        bb84: BB84,
        e91: E91,
        device_independent: DeviceIndependentQKD,
    }

    impl QKDService {
        pub fn new() -> Self {
            Self {
                bb84: BB84::new(),
                e91: E91::new(),
                device_independent: DeviceIndependentQKD::new(),
            }
        }

        /// Generate key using BB84 protocol
        pub fn bb84(&self, key_length: usize) -> Result<Vec<bool>, QKDError> {
            self.bb84.run_protocol(key_length)
        }

        /// Generate key using E91 protocol
        pub fn e91(&self, key_length: usize) -> Result<Vec<bool>, QKDError> {
            self.e91.run_protocol(key_length)
        }

        /// Generate key using device-independent QKD
        pub fn device_independent(
            &self,
            key_length: usize,
            chsh_threshold: f64,
        ) -> Result<Vec<bool>, QKDError> {
            self.device_independent.run_protocol(key_length, chsh_threshold)
        }

        /// Convert boolean key to bytes
        pub fn key_to_bytes(key: &[bool]) -> Vec<u8> {
            let mut bytes = Vec::with_capacity((key.len() + 7) / 8);
            let mut current_byte = 0u8;
            let mut bit_count = 0;
            
            for &bit in key {
                current_byte = (current_byte << 1) | if bit { 1 } else { 0 };
                bit_count += 1;
                
                if bit_count == 8 {
                    bytes.push(current_byte);
                    current_byte = 0;
                    bit_count = 0;
                }
            }
            
            // Pad remaining bits
            if bit_count > 0 {
                current_byte <<= (8 - bit_count);
                bytes.push(current_byte);
            }
            
            bytes
        }

        /// Convert bytes to boolean key
        pub fn bytes_to_key(bytes: &[u8]) -> Vec<bool> {
            let mut key = Vec::with_capacity(bytes.len() * 8);
            
            for &byte in bytes {
                for i in 0..8 {
                    let bit = (byte >> (7 - i)) & 1 == 1;
                    key.push(bit);
                }
            }
            
            key
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn test_bb84_protocol() {
            let qkd = QKDService::new();
            let key = qkd.bb84(256).expect("BB84 protocol failed");
            
            // Should produce a key
            assert!(!key.is_empty());
            // Key should be reasonably short due to sifting and privacy amplification
            assert!(key.len() <= 256 / 8); // At most 1/8th due to sifting and privacy amplification
        }

        #[test]
        fn test_e91_protocol() {
            let qkd = QKDService::new();
            let key = qkd.e91(256).expect("E91 protocol failed");
            
            // Should produce a key
            assert!(!key.is_empty());
        }

        #[test]
        fn test_device_independent_qkd() {
            let qkd = QKDService::new();
            let key = qkd.device_independent(256, 1.5)
                .expect("Device-independent QKD failed");
            
            // Should produce a key
            assert!(!key.is_empty());
        }

        #[test]
        fn test_key_conversion() {
            let original = vec![true, false, true, true, false, false, true, false];
            let bytes = QKDService::key_to_bytes(&original);
            let restored = QKDService::bytes_to_key(&bytes);
            
            // Should be identical (assuming no padding issues in this case)
            assert_eq!(original, restored);
        }

        #[test]
        fn test_bb84_error_detection() {
            // This test would require mocking an eavesdropper
            // For now, we just test that the protocol runs
            let qkd = QKDService::new();
            let result = qkd.bb84(512);
            // Should succeed under normal conditions
            assert!(result.is_ok());
        }
    }
}