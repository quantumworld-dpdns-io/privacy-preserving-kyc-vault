use anyhow::{anyhow, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, error, instrument};
use wasmtime_wasi::{
    DirPerms, FilePerms, WasiCtx, WasiCtxBuilder, WasiView,
};
use wasmtime_wasi_keyvalue::{KeyValue, KeyValueContext};
use wasmtime_wasi_crypto::{CryptoCtx, CryptoKey, CryptoKeyType, CryptoSignature};

pub struct WasiEnvironment {
    wasi_ctx: RwLock<Option<WasiCtx>>,
    kv_store: Arc<RwLock<HashMap<String, Vec<u8>>>>,
}

impl WasiEnvironment {
    pub fn new() -> Self {
        Self {
            wasi_ctx: RwLock::new(None),
            kv_store: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn build_ctx(
        &self,
        args: &[String],
        env_vars: &[(String, String)],
        allowed_dirs: &[(String, DirPerms, FilePerms)],
        preopens: &[(String, String)],
    ) -> WasiCtx {
        let mut builder = WasiCtxBuilder::new();

        builder.args(args);

        for (k, v) in env_vars {
            builder.env(k, v);
        }

        for (dir, dir_perm, file_perm) in allowed_dirs {
            builder.preopened_dir(dir, dir.clone(), *dir_perm, *file_perm);
        }

        for (guest_path, host_path) in preopens {
            builder.preopened_dir(host_path, guest_path, DirPerms::all(), FilePerms::all());
        }

        builder.inherit_stdio();
        builder.build()
    }

    pub fn build_restricted_ctx(&self) -> WasiCtx {
        let mut builder = WasiCtxBuilder::new();
        builder.args(&["wasm-module"]);
        builder.inherit_stderr();
        builder.build()
    }

    pub fn set_ctx(&self, ctx: WasiCtx) {
        *self.wasi_ctx.write() = Some(ctx);
    }

    pub fn get_ctx(&self) -> Option<WasiCtx> {
        self.wasi_ctx.read().clone()
    }

    pub fn kv_store(&self) -> Arc<RwLock<HashMap<String, Vec<u8>>>> {
        self.kv_store.clone()
    }
}

pub struct WasiPreview3 {
    environment: Arc<WasiEnvironment>,
    crypto_ctx: Arc<CryptoContext>,
}

pub struct CryptoContext {
    keys: RwLock<HashMap<String, CryptoKey>>,
    key_type: CryptoKeyType,
}

impl CryptoContext {
    pub fn new(key_type: CryptoKeyType) -> Self {
        Self {
            keys: RwLock::new(HashMap::new()),
            key_type,
        }
    }

    pub fn generate_key(&self, key_id: &str) -> Result<CryptoKey> {
        let key = CryptoKey::generate(self.key_type)
            .map_err(|e| anyhow!("Failed to generate key: {}", e))?;
        self.keys.write().insert(key_id.to_string(), key.clone());
        Ok(key)
    }

    pub fn import_key(&self, key_id: &str, raw: &[u8]) -> Result<CryptoKey> {
        let key = CryptoKey::import(self.key_type, raw)
            .map_err(|e| anyhow!("Failed to import key: {}", e))?;
        self.keys.write().insert(key_id.to_string(), key.clone());
        Ok(key)
    }

    pub fn get_key(&self, key_id: &str) -> Result<CryptoKey> {
        self.keys
            .read()
            .get(key_id)
            .cloned()
            .ok_or_else(|| anyhow!("Key '{}' not found", key_id))
    }

    pub fn sign(&self, key_id: &str, data: &[u8]) -> Result<Vec<u8>> {
        let key = self.get_key(key_id)?;
        let sig = CryptoSignature::sign(&key, data)
            .map_err(|e| anyhow!("Signing failed: {}", e))?;
        Ok(sig.as_ref().to_vec())
    }

    pub fn verify(&self, key_id: &str, data: &[u8], signature: &[u8]) -> Result<bool> {
        let key = self.get_key(key_id)?;
        let sig = CryptoSignature::from_bytes(signature)
            .map_err(|e| anyhow!("Invalid signature: {}", e))?;
        Ok(CryptoSignature::verify(&key, data, &sig).is_ok())
    }

    pub fn hash(&self, data: &[u8], algorithm: &str) -> Vec<u8> {
        match algorithm {
            "sha256" => {
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(data);
                hasher.finalize().to_vec()
            }
            "blake3" => blake3::hash(data).as_bytes().to_vec(),
            _ => blake3::hash(data).as_bytes().to_vec(),
        }
    }
}

pub struct KeyValueStore {
    store: Arc<RwLock<HashMap<String, Vec<u8>>>>,
}

impl KeyValueStore {
    pub fn new() -> Self {
        Self {
            store: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.store.read().get(key).cloned()
    }

    pub fn set(&self, key: &str, value: Vec<u8>) {
        self.store.write().insert(key.to_string(), value);
    }

    pub fn delete(&self, key: &str) -> bool {
        self.store.write().remove(key).is_some()
    }

    pub fn exists(&self, key: &str) -> bool {
        self.store.read().contains_key(key)
    }

    pub fn keys(&self) -> Vec<String> {
        self.store.read().keys().cloned().collect()
    }

    pub fn clear(&self) {
        self.store.write().clear();
    }
}

pub struct AsyncWasiOperations {
    pending: RwLock<HashMap<String, tokio::sync::oneshot::Sender<Result<Vec<u8>>>>>,
}

impl AsyncWasiOperations {
    pub fn new() -> Self {
        Self {
            pending: RwLock::new(HashMap::new()),
        }
    }

    pub async fn async_read(&self, path: &str) -> Result<Vec<u8>> {
        let data = tokio::fs::read(path).await?;
        Ok(data)
    }

    pub async fn async_write(&self, path: &str, data: &[u8]) -> Result<()> {
        tokio::fs::write(path, data).await?;
        Ok(())
    }

    pub async fn async_fetch(&self, url: &str) -> Result<Vec<u8>> {
        let response = reqwest::get(url).await?;
        let bytes = response.bytes().await?;
        Ok(bytes.to_vec())
    }

    pub fn submit_pending(&self, op_id: String, tx: tokio::sync::oneshot::Sender<Result<Vec<u8>>>) {
        self.pending.write().insert(op_id, tx);
    }

    pub fn complete_pending(&self, op_id: &str, result: Result<Vec<u8>>) -> Result<()> {
        let tx = self
            .pending
            .write()
            .remove(op_id)
            .ok_or_else(|| anyhow!("No pending operation '{}'", op_id))?;
        tx.send(result).map_err(|_| anyhow!("Receiver dropped"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasi_environment() {
        let env = WasiEnvironment::new();
        let ctx = env.build_restricted_ctx();
        assert!(ctx.args().contains(&"wasm-module".to_string()));
    }

    #[test]
    fn test_crypto_context_generate_key() {
        let ctx = CryptoContext::new(CryptoKeyType::Ed25519);
        let key = ctx.generate_key("test-key");
        assert!(key.is_ok());
    }

    #[test]
    fn test_key_value_store() {
        let kv = KeyValueStore::new();
        kv.set("hello", b"world".to_vec());
        assert_eq!(kv.get("hello"), Some(b"world".to_vec()));
        assert!(kv.exists("hello"));
        assert!(kv.delete("hello"));
        assert!(!kv.exists("hello"));
    }

    #[test]
    fn test_crypto_hash() {
        let ctx = CryptoContext::new(CryptoKeyType::Ed25519);
        let data = b"hello world";
        let hash = ctx.hash(data, "blake3");
        assert_eq!(hash.len(), 32);
        let hash256 = ctx.hash(data, "sha256");
        assert_eq!(hash256.len(), 32);
    }

    #[test]
    fn test_async_operations_creation() {
        let ops = AsyncWasiOperations::new();
        assert!(ops.pending.read().is_empty());
    }
}
