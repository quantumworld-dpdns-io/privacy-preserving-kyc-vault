use anyhow::{anyhow, Context, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tracing::{debug, error, info, instrument, warn};
use wasmtime::{
    Config, Engine, FuelConsumptionStrategy, Instance, Linker, Module, Store,
    StoreLimits, StoreLimitsBuilder, TypedFunc, Value,
};

const DEFAULT_FUEL_LIMIT: u64 = 1_000_000;
const DEFAULT_STORE_LIMIT: usize = 10 * 1024 * 1024; // 10 MB
const MAX_INSTANCES: usize = 100;
const MODULE_CACHE_CAPACITY: usize = 50;

/// Represents a loaded Wasm module with its compiled artifact
struct LoadedModule {
    module: Module,
    name: String,
    created_at: Instant,
    size_bytes: usize,
}

/// Runtime statistics for telemetry
#[derive(Debug, Clone, Default)]
pub struct RuntimeStats {
    pub total_modules_loaded: u64,
    pub total_instances_created: u64,
    pub total_fuel_consumed: u64,
    pub active_instances: usize,
    pub modules_cached: usize,
    pub total_execution_errors: u64,
}

/// Core Wasmtime runtime for executing WebAssembly modules
pub struct WasmRuntime {
    engine: Engine,
    linker: Linker<WasmRuntimeData>,
    modules: RwLock<HashMap<String, LoadedModule>>,
    instances: RwLock<HashMap<String, Instance>>,
    stats: RwLock<RuntimeStats>,
    fuel_limit: u64,
    store_limits: StoreLimits,
}

/// Data stored in the Wasmtime store for each instance
struct WasmRuntimeData {
    instance_id: String,
    start_time: Instant,
    fuel_consumed: u64,
}

impl WasmRuntime {
    /// Create a new WasmRuntime with the given configuration
    pub fn new(fuel_limit: Option<u64>) -> Result<Self> {
        let mut config = Config::new();
        config.wasm_multi_value(true);
        config.wasm_memory64(false);
        config.wasm_bulk_memory(true);
        config.wasm_reference_types(true);
        config.wasm_simd(true);
        config.wasm_threads(false);
        config.wasm_tail_call(false);
        config.consume_fuel(true);
        config.fuel_consumption_strategy(FuelConsumptionStrategy::Automatic);

        let engine = Engine::new(&config).context("Failed to create Wasmtime engine")?;
        let linker = Linker::<WasmRuntimeData>::new(&engine);

        let store_limits = StoreLimitsBuilder::new()
            .memory_size(DEFAULT_STORE_LIMIT)
            .memories(4)
            .trap_on_grow_failure(true)
            .build();

        let runtime = Self {
            engine,
            linker,
            modules: RwLock::new(HashMap::with_capacity(MODULE_CACHE_CAPACITY)),
            instances: RwLock::new(HashMap::with_capacity(MAX_INSTANCES)),
            stats: RwLock::new(RuntimeStats::default()),
            fuel_limit: fuel_limit.unwrap_or(DEFAULT_FUEL_LIMIT),
            store_limits,
        };

        runtime.register_host_functions()?;
        Ok(runtime)
    }

    /// Register host-side functions accessible from Wasm modules
    fn register_host_functions(&self) -> Result<()> {
        self.linker.func_wrap("env", "log", |msg: i32| {
            debug!("[wasm] Host log: {}", msg);
        })?;

        self.linker.func_wrap("env", "get_credential", |cred_id: i32| -> i32 {
            debug!("[wasm] get_credential called with id: {}", cred_id);
            0
        })?;

        self.linker.func_wrap("env", "verify_proof", |proof_ptr: i32, proof_len: i32| -> i32 {
            debug!("[wasm] verify_proof: ptr={}, len={}", proof_ptr, proof_len);
            1
        })?;

        self.linker.func_wrap("env", "emit_event", |event_type: i32, data_ptr: i32| -> i32 {
            debug!("[wasm] emit_event: type={}", event_type);
            0
        })?;

        Ok(())
    }

    /// Load a Wasm module from bytes, caching it
    pub fn load_module(&self, name: &str, wasm_bytes: &[u8]) -> Result<()> {
        let module = Module::new(&self.engine, wasm_bytes)
            .with_context(|| format!("Failed to compile Wasm module '{}'", name))?;

        let loaded = LoadedModule {
            module,
            name: name.to_string(),
            created_at: Instant::now(),
            size_bytes: wasm_bytes.len(),
        };

        let mut modules = self.modules.write();
        if modules.len() >= MODULE_CACHE_CAPACITY {
            let oldest = modules.iter().min_by_key(|(_, m)| m.created_at)
                .map(|(k, _)| k.clone());
            if let Some(old_key) = oldest {
                modules.remove(&old_key);
                debug!("Evicted oldest module '{}' from cache", old_key);
            }
        }
        modules.insert(name.to_string(), loaded);

        let mut stats = self.stats.write();
        stats.total_modules_loaded += 1;
        stats.modules_cached = modules.len();

        info!("Loaded Wasm module '{}' ({} bytes)", name, wasm_bytes.len());
        Ok(())
    }

    /// Load a module from a file path
    pub fn load_module_from_file(&self, name: &str, path: &Path) -> Result<()> {
        let wasm_bytes = std::fs::read(path)
            .with_context(|| format!("Failed to read Wasm file: {}", path.display()))?;
        self.load_module(name, &wasm_bytes)
    }

    /// Instantiate a loaded module with optional fuel metering
    pub fn instantiate(&self, name: &str, instance_id: &str) -> Result<Instance> {
        let modules = self.modules.read();
        let loaded = modules.get(name)
            .ok_or_else(|| anyhow!("Module '{}' not loaded", name))?;

        let mut store = Store::new(&self.engine, WasmRuntimeData {
            instance_id: instance_id.to_string(),
            start_time: Instant::now(),
            fuel_consumed: 0,
        });

        store.limiter(self.store_limits.clone());
        store.set_fuel(self.fuel_limit)?;

        let instance = self.linker.instantiate(&mut store, &loaded.module)
            .with_context(|| format!("Failed to instantiate module '{}'", name))?;

        let mut instances = self.instances.write();
        if instances.len() >= MAX_INSTANCES {
            return Err(anyhow!("Maximum instance limit ({}) reached", MAX_INSTANCES));
        }
        instances.insert(instance_id.to_string(), instance);

        let mut stats = self.stats.write();
        stats.total_instances_created += 1;
        stats.active_instances = instances.len();

        info!("Instantiated Wasm module '{}' as '{}'", name, instance_id);
        Ok(instance)
    }

    /// Execute a named exported function
    pub fn call_function(
        &self,
        instance_id: &str,
        func_name: &str,
        args: &[Value],
    ) -> Result<Vec<Value>> {
        let instances = self.instances.read();
        let instance = instances.get(instance_id)
            .ok_or_else(|| anyhow!("Instance '{}' not found", instance_id))?;

        let func = instance.get_export(func_name)
            .and_then(|e| e.into_func())
            .ok_or_else(|| anyhow!("Function '{}' not exported from '{}'", func_name, instance_id))?;

        let mut store = Store::new(&self.engine, WasmRuntimeData {
            instance_id: instance_id.to_string(),
            start_time: Instant::now(),
            fuel_consumed: 0,
        });

        store.limiter(self.store_limits.clone());
        store.set_fuel(self.fuel_limit)?;

        let func_typed = func.typed::<(), ()>(&store)?;
        func_typed.call(&mut store, ())?;

        let fuel_left = store.fuel_consumed()?;
        let fuel_used = self.fuel_limit.saturating_sub(fuel_left);

        let mut stats = self.stats.write();
        stats.total_fuel_consumed += fuel_used;

        debug!("Wasm call '{}.{}' consumed {} fuel", instance_id, func_name, fuel_used);
        Ok(vec![])
    }

    /// Execute the default `_start` function (for WAT modules with a start section)
    pub fn run_start_function(&self, instance_id: &str) -> Result<()> {
        self.call_function(instance_id, "_start", &[])?;
        Ok(())
    }

    /// Call the `verify_credential` standard export
    pub fn verify_credential(&self, instance_id: &str, credential_data: &[u8]) -> Result<bool> {
        let instances = self.instances.read();
        let instance = instances.get(instance_id)
            .ok_or_else(|| anyhow!("Instance '{}' not found", instance_id))?;

        let func = instance.get_export("verify_credential")
            .and_then(|e| e.into_func())
            .ok_or_else(|| anyhow!("Module '{}' does not export verify_credential", instance_id))?;

        let mut store = Store::new(&self.engine, WasmRuntimeData {
            instance_id: instance_id.to_string(),
            start_time: Instant::now(),
            fuel_consumed: 0,
        });

        store.limiter(self.store_limits.clone());
        store.set_fuel(self.fuel_limit)?;

        let typed_func = func.typed::<(i32, i32), i32>(&store)?;
        let result = typed_func.call(&mut store, (credential_data.as_ptr() as i32, credential_data.len() as i32))?;

        Ok(result != 0)
    }

    /// Remove an instance and free resources
    pub fn destroy_instance(&self, instance_id: &str) -> Result<()> {
        let mut instances = self.instances.write();
        instances.remove(instance_id);
        let mut stats = self.stats.write();
        stats.active_instances = instances.len();
        debug!("Destroyed Wasm instance '{}'", instance_id);
        Ok(())
    }

    /// Get runtime statistics
    pub fn get_stats(&self) -> RuntimeStats {
        self.stats.read().clone()
    }

    /// Get remaining fuel for a specific instance
    pub fn get_remaining_fuel(&self, instance_id: &str) -> Result<u64> {
        let _instances = self.instances.read();
        let mut store = Store::new(&self.engine, WasmRuntimeData {
            instance_id: instance_id.to_string(),
            start_time: Instant::now(),
            fuel_consumed: 0,
        });
        let fuel = store.fuel_consumed()?;
        Ok(self.fuel_limit.saturating_sub(fuel))
    }
}

impl Drop for WasmRuntime {
    fn drop(&mut self) {
        let stats = self.stats.get_mut();
        info!(
            "WasmRuntime shutdown: {} modules loaded, {} instances created, {} fuel consumed",
            stats.total_modules_loaded,
            stats.total_instances_created,
            stats.total_fuel_consumed,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_runtime_creation() {
        let runtime = WasmRuntime::new(None).unwrap();
        let stats = runtime.get_stats();
        assert_eq!(stats.total_modules_loaded, 0);
    }

    #[test]
    fn test_module_not_found() {
        let runtime = WasmRuntime::new(None).unwrap();
        let result = runtime.instantiate("nonexistent", "test-instance");
        assert!(result.is_err());
    }
}
