use anyhow::{anyhow, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{debug, error, instrument, warn};
use wasmtime::{Caller, Linker, Memory, StoreContextMut};

pub struct HostFunctionContext {
    pub instance_id: String,
    pub module_name: String,
}

pub type HashFn = Arc<dyn Fn(&[u8]) -> Vec<u8> + Send + Sync>;
pub type VerifyFn = Arc<dyn Fn(&[u8], &[u8]) -> bool + Send + Sync>;
pub type CheckFn = Arc<dyn Fn(&str, &serde_json::Value) -> Result<bool> + Send + Sync>;

pub struct HostFunctionRegistry {
    pub on_hash: Option<HashFn>,
    pub on_verify: Option<VerifyFn>,
    pub on_check: Option<CheckFn>,
    pub storage: Arc<RwLock<HashMap<String, Vec<u8>>>>,
}

impl Default for HostFunctionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl HostFunctionRegistry {
    pub fn new() -> Self {
        Self {
            on_hash: None,
            on_verify: None,
            on_check: None,
            storage: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn set_hash_fn(&mut self, f: HashFn) {
        self.on_hash = Some(f);
    }

    pub fn set_verify_fn(&mut self, f: VerifyFn) {
        self.on_verify = Some(f);
    }

    pub fn set_check_fn(&mut self, f: CheckFn) {
        self.on_check = Some(f);
    }

    pub fn register_all(&self, linker: &mut Linker<HostFunctionContext>) -> Result<()> {
        linker.func_wrap("kyc", "hash", |mut caller: Caller<'_, HostFunctionContext>, ptr: i32, len: i32, out_ptr: i32| -> i32 {
            Self::hash_impl(&mut caller, ptr, len, out_ptr)
        })?;

        linker.func_wrap("kyc", "verify_credential", |mut caller: Caller<'_, HostFunctionContext>, data_ptr: i32, data_len: i32, proof_ptr: i32, proof_len: i32| -> i32 {
            Self::verify_credential_impl(&mut caller, data_ptr, data_len, proof_ptr, proof_len)
        })?;

        linker.func_wrap("kyc", "check_attribute", |mut caller: Caller<'_, HostFunctionContext>, attr_ptr: i32, attr_len: i32, value_ptr: i32, value_len: i32| -> i32 {
            Self::check_attribute_impl(&mut caller, attr_ptr, attr_len, value_ptr, value_len)
        })?;

        linker.func_wrap("kyc", "store_blob", |mut caller: Caller<'_, HostFunctionContext>, key_ptr: i32, key_len: i32, data_ptr: i32, data_len: i32| -> i32 {
            Self::store_blob_impl(&mut caller, key_ptr, key_len, data_ptr, data_len)
        })?;

        linker.func_wrap("kyc", "get_blob", |mut caller: Caller<'_, HostFunctionContext>, key_ptr: i32, key_len: i32, out_ptr: i32, out_len: i32| -> i32 {
            Self::get_blob_impl(&mut caller, key_ptr, key_len, out_ptr, out_len)
        })?;

        linker.func_wrap("kyc", "emit_event", |mut caller: Caller<'_, HostFunctionContext>, event_type_ptr: i32, event_type_len: i32, payload_ptr: i32, payload_len: i32| -> i32 {
            Self::emit_event_impl(&mut caller, event_type_ptr, event_type_len, payload_ptr, payload_len)
        })?;

        linker.func_wrap("kyc", "log_message", |mut caller: Caller<'_, HostFunctionContext>, msg_ptr: i32, msg_len: i32| -> i32 {
            Self::log_message_impl(&mut caller, msg_ptr, msg_len)
        })?;

        linker.func_wrap("kyc", "random_bytes", |mut caller: Caller<'_, HostFunctionContext>, out_ptr: i32, len: i32| -> i32 {
            Self::random_bytes_impl(&mut caller, out_ptr, len)
        })?;

        Ok(())
    }

    fn read_memory(caller: &mut Caller<'_, HostFunctionContext>, ptr: i32, len: i32) -> Result<Vec<u8>> {
        let memory = caller
            .get_export("memory")
            .and_then(|e| e.into_memory())
            .ok_or_else(|| anyhow!("No memory export"))?;

        let mut buf = vec![0u8; len as usize];
        memory.read(&caller, ptr as usize, &mut buf)?;
        Ok(buf)
    }

    fn write_memory(caller: &mut Caller<'_, HostFunctionContext>, ptr: i32, data: &[u8]) -> Result<()> {
        let memory = caller
            .get_export("memory")
            .and_then(|e| e.into_memory())
            .ok_or_else(|| anyhow!("No memory export"))?;

        memory.write(&mut caller, ptr as usize, data)?;
        Ok(())
    }

    fn hash_impl(caller: &mut Caller<'_, HostFunctionContext>, ptr: i32, len: i32, out_ptr: i32) -> i32 {
        let data = match Self::read_memory(caller, ptr, len) {
            Ok(d) => d,
            Err(e) => {
                error!("hash: read_memory failed: {}", e);
                return -1;
            }
        };

        let hash = blake3::hash(&data);
        let hash_bytes = hash.as_bytes().to_vec();

        match Self::write_memory(caller, out_ptr, &hash_bytes) {
            Ok(_) => hash_bytes.len() as i32,
            Err(e) => {
                error!("hash: write_memory failed: {}", e);
                -1
            }
        }
    }

    fn verify_credential_impl(
        caller: &mut Caller<'_, HostFunctionContext>,
        data_ptr: i32,
        data_len: i32,
        proof_ptr: i32,
        proof_len: i32,
    ) -> i32 {
        let data = match Self::read_memory(caller, data_ptr, data_len) {
            Ok(d) => d,
            Err(e) => {
                error!("verify_credential: read data failed: {}", e);
                return -1;
            }
        };

        let proof = match Self::read_memory(caller, proof_ptr, proof_len) {
            Ok(p) => p,
            Err(e) => {
                error!("verify_credential: read proof failed: {}", e);
                return -1;
            }
        };

        let ctx = caller.data();
        let verified = match ctx.on_verify.as_ref() {
            Some(f) => f(&data, &proof),
            None => {
                debug!("verify_credential: no verify function registered, defaulting to true");
                true
            }
        };

        if verified { 1 } else { 0 }
    }

    fn check_attribute_impl(
        caller: &mut Caller<'_, HostFunctionContext>,
        attr_ptr: i32,
        attr_len: i32,
        value_ptr: i32,
        value_len: i32,
    ) -> i32 {
        let attr_bytes = match Self::read_memory(caller, attr_ptr, attr_len) {
            Ok(d) => d,
            Err(e) => {
                error!("check_attribute: read attr failed: {}", e);
                return -1;
            }
        };

        let value_bytes = match Self::read_memory(caller, value_ptr, value_len) {
            Ok(d) => d,
            Err(e) => {
                error!("check_attribute: read value failed: {}", e);
                return -1;
            }
        };

        let attr = String::from_utf8_lossy(&attr_bytes);
        let value: serde_json::Value = match serde_json::from_slice(&value_bytes) {
            Ok(v) => v,
            Err(e) => {
                error!("check_attribute: invalid json value: {}", e);
                return -1;
            }
        };

        let ctx = caller.data();
        let result = match ctx.on_check.as_ref() {
            Some(f) => match f(&attr, &value) {
                Ok(true) => 1,
                Ok(false) => 0,
                Err(e) => {
                    error!("check_attribute: check failed: {}", e);
                    -2
                }
            },
            None => {
                debug!("check_attribute: no check function registered, returning true");
                1
            }
        };

        result
    }

    fn store_blob_impl(
        caller: &mut Caller<'_, HostFunctionContext>,
        key_ptr: i32,
        key_len: i32,
        data_ptr: i32,
        data_len: i32,
    ) -> i32 {
        let key_bytes = match Self::read_memory(caller, key_ptr, key_len) {
            Ok(d) => d,
            Err(e) => {
                error!("store_blob: read key failed: {}", e);
                return -1;
            }
        };

        let data = match Self::read_memory(caller, data_ptr, data_len) {
            Ok(d) => d,
            Err(e) => {
                error!("store_blob: read data failed: {}", e);
                return -1;
            }
        };

        let key = String::from_utf8_lossy(&key_bytes).to_string();
        let ctx = caller.data_mut();

        let storage = unsafe { &*(ctx.storage as *const RwLock<HashMap<String, Vec<u8>>>) };
        storage.write().insert(key, data);

        0
    }

    fn get_blob_impl(
        caller: &mut Caller<'_, HostFunctionContext>,
        key_ptr: i32,
        key_len: i32,
        out_ptr: i32,
        out_len: i32,
    ) -> i32 {
        let key_bytes = match Self::read_memory(caller, key_ptr, key_len) {
            Ok(d) => d,
            Err(e) => {
                error!("get_blob: read key failed: {}", e);
                return -1;
            }
        };

        let key = String::from_utf8_lossy(&key_bytes).to_string();
        let ctx = caller.data_mut();

        let storage = unsafe { &*(ctx.storage as *const RwLock<HashMap<String, Vec<u8>>>) };
        let data = storage.read().get(&key).cloned();

        match data {
            Some(bytes) => {
                let max_len = out_len as usize;
                let write_len = bytes.len().min(max_len);
                let to_write = &bytes[..write_len];
                match Self::write_memory(caller, out_ptr, to_write) {
                    Ok(_) => write_len as i32,
                    Err(e) => {
                        error!("get_blob: write failed: {}", e);
                        -1
                    }
                }
            }
            None => {
                debug!("get_blob: key '{}' not found", key);
                -2
            }
        }
    }

    fn emit_event_impl(
        caller: &mut Caller<'_, HostFunctionContext>,
        event_type_ptr: i32,
        event_type_len: i32,
        payload_ptr: i32,
        payload_len: i32,
    ) -> i32 {
        let event_type_bytes = match Self::read_memory(caller, event_type_ptr, event_type_len) {
            Ok(d) => d,
            Err(e) => {
                error!("emit_event: read type failed: {}", e);
                return -1;
            }
        };

        let payload = match Self::read_memory(caller, payload_ptr, payload_len) {
            Ok(d) => d,
            Err(e) => {
                error!("emit_event: read payload failed: {}", e);
                return -1;
            }
        };

        let event_type = String::from_utf8_lossy(&event_type_bytes);
        let payload_str = String::from_utf8_lossy(&payload);

        debug!(
            "Event emitted: type='{}' payload='{}'",
            event_type, payload_str
        );

        0
    }

    fn log_message_impl(caller: &mut Caller<'_, HostFunctionContext>, msg_ptr: i32, msg_len: i32) -> i32 {
        let msg_bytes = match Self::read_memory(caller, msg_ptr, msg_len) {
            Ok(d) => d,
            Err(e) => {
                error!("log_message: read failed: {}", e);
                return -1;
            }
        };

        let msg = String::from_utf8_lossy(&msg_bytes);
        let ctx = caller.data();
        debug!("[wasm:{}] {}", ctx.module_name, msg);
        0
    }

    fn random_bytes_impl(out_ptr: i32, len: i32) -> i32 {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..len).map(|_| rng.gen()).collect();
        todo!("random_bytes needs caller to write to guest memory");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasmtime::{Config, Engine, Linker, Module, Store};

    #[test]
    fn test_registry_creation() {
        let registry = HostFunctionRegistry::new();
        assert!(registry.on_hash.is_none());
    }

    #[test]
    fn test_register_host_functions() {
        let config = Config::new();
        let engine = Engine::new(&config).unwrap();
        let mut linker: Linker<HostFunctionContext> = Linker::new(&engine);
        let registry = HostFunctionRegistry::new();
        assert!(registry.register_all(&mut linker).is_ok());
    }
}
