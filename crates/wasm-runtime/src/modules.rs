use crate::sandbox::SandboxConfig;
use anyhow::{anyhow, Context, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, instrument, warn};
use wasmtime::{Engine, Module};

#[derive(Debug, Clone)]
pub struct ModuleMetadata {
    pub name: String,
    pub size_bytes: usize,
    pub compiled_at: Instant,
    pub hash: [u8; 32],
    pub signature: Option<Vec<u8>>,
    pub signer_pubkey: Option<Vec<u8>>,
    pub imports: Vec<(String, String)>,
    pub exports: Vec<String>,
}

pub struct CompiledModule {
    pub module: Module,
    pub metadata: ModuleMetadata,
}

pub struct ModuleCache {
    modules: RwLock<HashMap<String, CompiledModule>>,
    access_order: RwLock<Vec<String>>,
    capacity: usize,
    engine: Engine,
}

impl ModuleCache {
    pub fn new(engine: &Engine, capacity: usize) -> Self {
        Self {
            modules: RwLock::new(HashMap::with_capacity(capacity)),
            access_order: RwLock::new(Vec::with_capacity(capacity)),
            capacity,
            engine: engine.clone(),
        }
    }

    #[instrument(skip(self, wasm_bytes))]
    pub fn load(
        &self,
        name: &str,
        wasm_bytes: &[u8],
        signature: Option<Vec<u8>>,
        signer_pubkey: Option<Vec<u8>>,
        sandbox: &SandboxConfig,
    ) -> Result<Arc<Module>> {
        if let Some((max_size, _)) = sandbox.max_module_size {
            if wasm_bytes.len() > max_size {
                return Err(anyhow!(
                    "Module '{}' size {} exceeds limit {}",
                    name,
                    wasm_bytes.len(),
                    max_size
                ));
            }
        }

        let module = Module::new(&self.engine, wasm_bytes)
            .with_context(|| format!("Failed to compile wasm module '{}'", name))?;

        let metadata = ModuleMetadata {
            name: name.to_string(),
            size_bytes: wasm_bytes.len(),
            compiled_at: Instant::now(),
            hash: blake3::hash(wasm_bytes).into(),
            signature,
            signer_pubkey,
            imports: module
                .imports()
                .iter()
                .map(|i| (i.module().to_string(), i.name().to_string()))
                .collect(),
            exports: module
                .exports()
                .iter()
                .map(|e| e.name().to_string())
                .collect(),
        };

        let compiled = CompiledModule {
            module: module.clone(),
            metadata,
        };

        let mut modules = self.modules.write();
        let mut access = self.access_order.write();

        if modules.len() >= self.capacity {
            if let Some(oldest) = access.first().cloned() {
                modules.remove(&oldest);
                access.retain(|k| k != &oldest);
                debug!("Evicted module '{}' from cache (capacity={})", oldest, self.capacity);
            }
        }

        access.push(name.to_string());
        modules.insert(name.to_string(), compiled);

        info!(
            "Loaded wasm module '{}' ({} bytes, {} imports, {} exports)",
            name,
            wasm_bytes.len(),
            metadata.imports.len(),
            metadata.exports.len()
        );

        Ok(Arc::new(module))
    }

    pub fn get(&self, name: &str) -> Option<Arc<Module>> {
        let modules = self.modules.read();
        let mut access = self.access_order.write();
        if modules.contains_key(name) {
            access.retain(|k| k != name);
            access.push(name.to_string());
            modules.get(name).map(|c| Arc::new(c.module.clone()))
        } else {
            None
        }
    }

    pub fn get_metadata(&self, name: &str) -> Option<ModuleMetadata> {
        self.modules.read().get(name).map(|c| c.metadata.clone())
    }

    pub fn contains(&self, name: &str) -> bool {
        self.modules.read().contains_key(name)
    }

    pub fn remove(&self, name: &str) -> bool {
        let mut modules = self.modules.write();
        let mut access = self.access_order.write();
        access.retain(|k| k != name);
        modules.remove(name).is_some()
    }

    pub fn len(&self) -> usize {
        self.modules.read().len()
    }

    pub fn is_empty(&self) -> bool {
        self.modules.read().is_empty()
    }

    pub fn list_modules(&self) -> Vec<ModuleMetadata> {
        self.modules
            .read()
            .values()
            .map(|c| c.metadata.clone())
            .collect()
    }

    pub fn clear(&self) {
        self.modules.write().clear();
        self.access_order.write().clear();
    }

    pub fn evict_expired(&self, ttl: Duration) -> usize {
        let mut modules = self.modules.write();
        let mut access = self.access_order.write();
        let before = modules.len();
        let cutoff = Instant::now() - ttl;
        let expired: Vec<String> = modules
            .iter()
            .filter(|(_, m)| m.metadata.compiled_at < cutoff)
            .map(|(k, _)| k.clone())
            .collect();
        for key in &expired {
            modules.remove(key);
            access.retain(|k| k != key);
        }
        before - modules.len()
    }
}

pub struct SignatureValidator;

impl SignatureValidator {
    pub fn validate(
        wasm_bytes: &[u8],
        signature: &[u8],
        pubkey: &[u8],
    ) -> Result<bool> {
        use ed25519_dalek::{Signature, Verifier, VerifyingKey};

        let verifying_key = VerifyingKey::from_bytes(
            pubkey.try_into().map_err(|_| anyhow!("Invalid pubkey length"))?,
        )
        .map_err(|e| anyhow!("Invalid ed25519 pubkey: {}", e))?;

        let sig = Signature::from_slice(signature)
            .map_err(|e| anyhow!("Invalid ed25519 signature: {}", e))?;

        Ok(verifying_key.verify(wasm_bytes, &sig).is_ok())
    }

    pub fn validate_with_hash(
        wasm_bytes: &[u8],
        expected_hash: &[u8; 32],
    ) -> Result<bool> {
        let actual = blake3::hash(wasm_bytes);
        Ok(actual.as_bytes() == expected_hash)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::SandboxConfig;

    #[test]
    fn test_module_cache_creation() {
        let config = wasmtime::Config::new();
        let engine = Engine::new(&config).unwrap();
        let cache = ModuleCache::new(&engine, 10);
        assert!(cache.is_empty());
        assert_eq!(cache.capacity, 10);
    }

    #[test]
    fn test_signature_validator() {
        use ed25519_dalek::Signer;
        let keypair = ed25519_dalek::Keypair::generate(&mut rand::thread_rng());
        let data = b"test wasm binary content";
        let signature = keypair.sign(data).to_bytes().to_vec();
        let pubkey = keypair.public.to_bytes().to_vec();
        let result = SignatureValidator::validate(data, &signature, &pubkey).unwrap();
        assert!(result);
    }

    #[test]
    fn test_signature_validator_bad() {
        let data = b"test data";
        let signature = vec![0u8; 64];
        let pubkey = vec![0u8; 32];
        let result = SignatureValidator::validate(data, &signature, &pubkey);
        assert!(result.is_err() || result.unwrap() == false);
    }

    #[test]
    fn test_hash_validation() {
        let data = b"hello wasm";
        let hash = blake3::hash(data).into();
        assert!(SignatureValidator::validate_with_hash(data, &hash).unwrap());
        let wrong = [0u8; 32];
        assert!(!SignatureValidator::validate_with_hash(data, &wrong).unwrap());
    }
}
