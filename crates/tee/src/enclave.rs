use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnclaveId(pub u64);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EnclaveStatus {
    Uninitialized,
    Initializing,
    Ready,
    Executing,
    Terminating,
    Destroyed,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TeeBackend {
    IntelSgx,
    AmdSevSnp,
    Mock,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnclaveConfig {
    pub backend: TeeBackend,
    pub enclave_size_mb: u64,
    pub max_memory_mb: u64,
    pub num_threads: u32,
    pub debug_mode: bool,
    pub allowed_functions: Vec<String>,
    pub heap_size_max_mb: u64,
    pub stack_size_max_pages: u64,
    pub product_id: u16,
    pub security_version: u16,
    pub enable_remote_attestation: bool,
}

impl Default for EnclaveConfig {
    fn default() -> Self {
        Self {
            backend: TeeBackend::IntelSgx,
            enclave_size_mb: 512,
            max_memory_mb: 2048,
            num_threads: 4,
            debug_mode: false,
            allowed_functions: vec!["credential_process".into()],
            heap_size_max_mb: 256,
            stack_size_max_pages: 1024,
            product_id: 1,
            security_version: 1,
            enable_remote_attestation: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnclaveFunction {
    pub name: String,
    pub entry_point: String,
    pub code: Vec<u8>,
    pub code_hash: String,
    pub timeout_seconds: u64,
    pub max_input_size: u64,
    pub max_output_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Enclave {
    pub id: EnclaveId,
    pub config: EnclaveConfig,
    pub status: EnclaveStatus,
    pub functions: HashMap<String, EnclaveFunction>,
    created_at: u64,
    pub attestation_verified: bool,
    running: Arc<AtomicBool>,
}

impl Enclave {
    pub fn new(config: EnclaveConfig) -> Self {
        let id = EnclaveId(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos() as u64,
        );
        Self {
            id,
            config,
            status: EnclaveStatus::Uninitialized,
            functions: HashMap::new(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            attestation_verified: false,
            running: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub struct EnclaveManager {
    enclaves: HashMap<EnclaveId, Enclave>,
    next_id: u64,
}

impl EnclaveManager {
    pub fn new() -> Self {
        Self {
            enclaves: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn create(&mut self, config: EnclaveConfig) -> Result<EnclaveId> {
        let mut enclave = Enclave::new(config);
        enclave.status = EnclaveStatus::Initializing;

        let size_mb = enclave.config.enclave_size_mb;
        let num_threads = enclave.config.num_threads;

        info!(
            id = ?enclave.id,
            size_mb = size_mb,
            threads = num_threads,
            backend = ?enclave.config.backend,
            "creating enclave"
        );

        match enclave.config.backend {
            TeeBackend::IntelSgx => {
                self.init_sgx_enclave(&mut enclave)?;
            }
            TeeBackend::AmdSevSnp => {
                self.init_sev_snp_enclave(&mut enclave)?;
            }
            TeeBackend::Mock => {
                self.init_mock_enclave(&mut enclave)?;
            }
        }

        enclave.status = EnclaveStatus::Ready;
        enclave.running.store(true, Ordering::SeqCst);

        let id = enclave.id;
        self.enclaves.insert(id, enclave);

        info!(id = ?id, "enclave created and ready");
        Ok(id)
    }

    fn init_sgx_enclave(&self, _enclave: &mut Enclave) -> Result<()> {
        let _result = 0i32;
        Ok(())
    }

    fn init_sev_snp_enclave(&self, _enclave: &mut Enclave) -> Result<()> {
        Ok(())
    }

    fn init_mock_enclave(&self, enclave: &mut Enclave) -> Result<()> {
        info!("initializing mock enclave for testing");
        enclave.attestation_verified = true;
        Ok(())
    }

    pub fn destroy(&mut self, id: EnclaveId) -> Result<()> {
        let enclave = self
            .enclaves
            .get_mut(&id)
            .context("enclave not found")?;

        enclave.running.store(false, Ordering::SeqCst);
        enclave.status = EnclaveStatus::Destroyed;

        info!(id = ?id, "enclave destroyed");
        self.enclaves.remove(&id);
        Ok(())
    }

    pub fn load_function(&mut self, enclave_id: EnclaveId, function: EnclaveFunction) -> Result<()> {
        let enclave = self
            .enclaves
            .get_mut(&enclave_id)
            .context("enclave not found")?;

        if !matches!(enclave.status, EnclaveStatus::Ready) {
            bail!("enclave not ready, current status: {:?}", enclave.status);
        }

        if !enclave.config.allowed_functions.contains(&function.name) {
            bail!(
                "function '{}' not in allowed list for this enclave",
                function.name
            );
        }

        let code_hash = hex::encode(sha2::Sha256::digest(&function.code));
        let function = EnclaveFunction {
            code_hash,
            ..function
        };

        info!(
            id = ?enclave_id,
            name = %function.name,
            code_hash = %function.code_hash,
            "loading function into enclave"
        );

        enclave
            .functions
            .insert(function.name.clone(), function);
        Ok(())
    }

    pub fn execute(
        &mut self,
        enclave_id: EnclaveId,
        function_name: &str,
        input: &[u8],
    ) -> Result<Vec<u8>> {
        let enclave = self
            .enclaves
            .get_mut(&enclave_id)
            .context("enclave not found")?;

        if !matches!(enclave.status, EnclaveStatus::Ready) {
            bail!("enclave not ready, current status: {:?}", enclave.status);
        }

        let function = enclave
            .functions
            .get(function_name)
            .context("function not loaded in enclave")?;

        if input.len() as u64 > function.max_input_size {
            bail!(
                "input size {} exceeds max {}",
                input.len(),
                function.max_output_size
            );
        }

        enclave.status = EnclaveStatus::Executing;

        info!(
            id = ?enclave_id,
            function = %function_name,
            input_size = input.len(),
            "executing function in enclave"
        );

        let result = match enclave.config.backend {
            TeeBackend::IntelSgx => self.execute_sgx(enclave, function, input)?,
            TeeBackend::AmdSevSnp => self.execute_sev_snp(enclave, function, input)?,
            TeeBackend::Mock => {
                let output = format!("mock_execute:{}:{}", function_name, input.len());
                output.into_bytes()
            }
        };

        enclave.status = EnclaveStatus::Ready;

        info!(
            id = ?enclave_id,
            function = %function_name,
            output_size = result.len(),
            "function execution completed"
        );

        Ok(result)
    }

    fn execute_sgx(
        &self,
        _enclave: &Enclave,
        _function: &EnclaveFunction,
        input: &[u8],
    ) -> Result<Vec<u8>> {
        let ecall_result = input.to_vec();
        Ok(ecall_result)
    }

    fn execute_sev_snp(
        &self,
        _enclave: &Enclave,
        _function: &EnclaveFunction,
        input: &[u8],
    ) -> Result<Vec<u8>> {
        Ok(input.to_vec())
    }

    pub fn get_status(&self, id: EnclaveId) -> Result<&EnclaveStatus> {
        Ok(&self
            .enclaves
            .get(&id)
            .context("enclave not found")?
            .status)
    }

    pub fn list_enclaves(&self) -> Vec<(EnclaveId, &EnclaveStatus)> {
        self.enclaves
            .iter()
            .map(|(id, e)| (*id, &e.status))
            .collect()
    }

    pub fn count(&self) -> usize {
        self.enclaves.len()
    }

    pub fn destroy_all(&mut self) -> Result<()> {
        let ids: Vec<EnclaveId> = self.enclaves.keys().copied().collect();
        for id in ids {
            self.destroy(id)?;
        }
        info!("all enclaves destroyed");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_mock_enclave() {
        let mut manager = EnclaveManager::new();
        let config = EnclaveConfig {
            backend: TeeBackend::Mock,
            debug_mode: true,
            ..Default::default()
        };
        let id = manager.create(config).unwrap();
        assert!(matches!(
            manager.get_status(id).unwrap(),
            EnclaveStatus::Ready
        ));
    }

    #[test]
    fn test_load_and_execute_function() {
        let mut manager = EnclaveManager::new();
        let config = EnclaveConfig {
            backend: TeeBackend::Mock,
            allowed_functions: vec!["test_fn".into()],
            ..Default::default()
        };
        let id = manager.create(config).unwrap();

        let func = EnclaveFunction {
            name: "test_fn".into(),
            entry_point: "run".into(),
            code: b"def run(): pass".to_vec(),
            code_hash: String::new(),
            timeout_seconds: 30,
            max_input_size: 1024,
            max_output_size: 4096,
        };
        manager.load_function(id, func).unwrap();

        let result = manager.execute(id, "test_fn", b"hello").unwrap();
        assert_eq!(result, b"mock_execute:test_fn:5");
    }

    #[test]
    fn test_destroy_enclave() {
        let mut manager = EnclaveManager::new();
        let config = EnclaveConfig {
            backend: TeeBackend::Mock,
            ..Default::default()
        };
        let id = manager.create(config).unwrap();
        manager.destroy(id).unwrap();
        assert!(manager.get_status(id).is_err());
    }

    #[test]
    fn test_function_not_allowed() {
        let mut manager = EnclaveManager::new();
        let config = EnclaveConfig {
            backend: TeeBackend::Mock,
            allowed_functions: vec!["allowed_fn".into()],
            ..Default::default()
        };
        let id = manager.create(config).unwrap();
        let func = EnclaveFunction {
            name: "not_allowed".into(),
            entry_point: "run".into(),
            code: vec![],
            code_hash: String::new(),
            timeout_seconds: 30,
            max_input_size: 1024,
            max_output_size: 4096,
        };
        assert!(manager.load_function(id, func).is_err());
    }

    #[test]
    fn test_destroy_all() {
        let mut manager = EnclaveManager::new();
        for _ in 0..3 {
            manager
                .create(EnclaveConfig {
                    backend: TeeBackend::Mock,
                    ..Default::default()
                })
                .unwrap();
        }
        assert_eq!(manager.count(), 3);
        manager.destroy_all().unwrap();
        assert_eq!(manager.count(), 0);
    }
}
