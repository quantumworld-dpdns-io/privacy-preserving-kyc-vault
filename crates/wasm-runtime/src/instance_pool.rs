use crate::sandbox::SandboxConfig;
use anyhow::{anyhow, Context, Result};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, instrument, warn};
use wasmtime::{Instance, Memory, Module, Store};

struct PoolEntry {
    instance: Instance,
    module_name: String,
    instance_id: String,
    created_at: Instant,
    last_used: Instant,
    fuel_consumed: u64,
    in_use: bool,
}

pub struct InstancePool {
    engine: wasmtime::Engine,
    entries: RwLock<HashMap<String, PoolEntry>>,
    max_size: usize,
    idle_timeout: Duration,
    module_cache: Arc<crate::modules::ModuleCache>,
    sandbox: SandboxConfig,
    stats: RwLock<PoolStats>,
}

#[derive(Debug, Clone, Default)]
pub struct PoolStats {
    pub total_created: u64,
    pub total_destroyed: u64,
    pub total_reused: u64,
    pub active_count: usize,
    pub idle_count: usize,
    pub pool_hits: u64,
    pub pool_misses: u64,
}

#[derive(Debug, Clone)]
pub struct InstanceHandle {
    pub instance_id: String,
    pub module_name: String,
    inner: Arc<RwLock<HandleInner>>,
}

#[derive(Debug)]
struct HandleInner {
    instance: Option<Instance>,
    released: bool,
}

impl InstanceHandle {
    pub fn instance(&self) -> Result<Instance> {
        let inner = self.inner.read();
        inner
            .instance
            .clone()
            .ok_or_else(|| anyhow!("Instance '{}' no longer available", self.instance_id))
    }

    pub fn release(self) -> Result<()> {
        let mut inner = self.inner.write();
        if inner.released {
            return Err(anyhow!("Instance '{}' already released", self.instance_id));
        }
        inner.released = true;
        Ok(())
    }
}

impl InstancePool {
    pub fn new(
        engine: &wasmtime::Engine,
        max_size: usize,
        sandbox: SandboxConfig,
        module_cache: Arc<crate::modules::ModuleCache>,
    ) -> Self {
        Self {
            engine: engine.clone(),
            entries: RwLock::new(HashMap::with_capacity(max_size)),
            max_size,
            idle_timeout: Duration::from_secs(300),
            module_cache,
            sandbox,
            stats: RwLock::new(PoolStats::default()),
        }
    }

    pub fn with_idle_timeout(mut self, timeout: Duration) -> Self {
        self.idle_timeout = timeout;
        self
    }

    pub fn set_idle_timeout(&mut self, timeout: Duration) {
        self.idle_timeout = timeout;
    }

    #[instrument(skip(self))]
    pub fn acquire(&self, module_name: &str) -> Result<InstanceHandle> {
        let module = self
            .module_cache
            .get(module_name)
            .ok_or_else(|| anyhow!("Module '{}' not loaded in cache", module_name))?;

        {
            let mut entries = self.entries.write();
            let stats_key = format!("{}:{}", module_name, "{idle}");

            if let Some((id, entry)) = entries
                .iter_mut()
                .find(|(_, e)| e.module_name == module_name && !e.in_use)
            {
                entry.in_use = true;
                entry.last_used = Instant::now();
                let handle_id = id.clone();
                let mut stats = self.stats.write();
                stats.pool_hits += 1;
                stats.total_reused += 1;
                debug!("Reusing instance '{}' from pool", handle_id);

                return Ok(InstanceHandle {
                    instance_id: handle_id,
                    module_name: module_name.to_string(),
                    inner: Arc::new(RwLock::new(HandleInner {
                        instance: Some(entry.instance.clone()),
                        released: false,
                    })),
                });
            }
        }

        {
            let mut stats = self.stats.write();
            stats.pool_misses += 1;
        }

        let instance_id = format!("{}-{}", module_name, uuid::Uuid::new_v4());
        let instance = self.create_instance(&module, &instance_id)?;

        {
            let mut entries = self.entries.write();
            if entries.len() >= self.max_size {
                let victim = entries
                    .iter()
                    .filter(|(_, e)| !e.in_use)
                    .min_by_key(|(_, e)| e.last_used)
                    .map(|(k, _)| k.clone());

                if let Some(victim_id) = victim {
                    entries.remove(&victim_id);
                    let mut stats = self.stats.write();
                    stats.total_destroyed += 1;
                    debug!("Evicted idle instance '{}' (LRU)", victim_id);
                } else {
                    return Err(anyhow!(
                        "Instance pool full ({}), all instances in use",
                        self.max_size
                    ));
                }
            }

            entries.insert(
                instance_id.clone(),
                PoolEntry {
                    instance: instance.clone(),
                    module_name: module_name.to_string(),
                    instance_id: instance_id.clone(),
                    created_at: Instant::now(),
                    last_used: Instant::now(),
                    fuel_consumed: 0,
                    in_use: true,
                },
            );

            let mut stats = self.stats.write();
            stats.total_created += 1;
        }

        info!("Created new instance '{}' from module '{}'", instance_id, module_name);

        Ok(InstanceHandle {
            instance_id: instance_id.clone(),
            module_name: module_name.to_string(),
            inner: Arc::new(RwLock::new(HandleInner {
                instance: Some(instance),
                released: false,
            })),
        })
    }

    fn create_instance(&self, module: &Module, instance_id: &str) -> Result<Instance> {
        let mut store = Store::new(
            &self.engine,
            crate::host_functions::HostFunctionContext {
                instance_id: instance_id.to_string(),
                module_name: String::new(),
            },
        );

        store.limiter(self.sandbox.build_store_limits());
        store.set_fuel(self.sandbox.max_fuel)?;

        let linker = wasmtime::Linker::<crate::host_functions::HostFunctionContext>::new(&self.engine);
        let instance = linker
            .instantiate(&mut store, module)
            .with_context(|| format!("Failed to instantiate '{}'", instance_id))?;

        Ok(instance)
    }

    pub fn release(&self, instance_id: &str) -> Result<()> {
        let mut entries = self.entries.write();
        if let Some(entry) = entries.get_mut(instance_id) {
            entry.in_use = false;
            entry.last_used = Instant::now();
            let fuel = entry.fuel_consumed;
            debug!("Released instance '{}' back to pool (fuel={})", instance_id, fuel);
            Ok(())
        } else {
            Err(anyhow!("Instance '{}' not found in pool", instance_id))
        }
    }

    pub fn destroy(&self, instance_id: &str) -> Result<()> {
        let mut entries = self.entries.write();
        if entries.remove(instance_id).is_some() {
            let mut stats = self.stats.write();
            stats.total_destroyed += 1;
            debug!("Destroyed instance '{}'", instance_id);
            Ok(())
        } else {
            Err(anyhow!("Instance '{}' not found", instance_id))
        }
    }

    pub fn evict_idle(&self) -> usize {
        let mut entries = self.entries.write();
        let now = Instant::now();
        let before = entries.len();

        entries.retain(|_, e| {
            if !e.in_use && now.duration_since(e.last_used) > self.idle_timeout {
                debug!("Evicting idle instance '{}'", e.instance_id);
                false
            } else {
                true
            }
        });

        let evicted = before - entries.len();
        if evicted > 0 {
            let mut stats = self.stats.write();
            stats.total_destroyed += evicted as u64;
            info!("Evicted {} idle instances", evicted);
        }
        evicted
    }

    pub fn resize(&self, new_max: usize) -> usize {
        let mut entries = self.entries.write();
        if new_max >= entries.len() {
            self.max_size = new_max;
            return 0;
        }

        let mut to_remove: Vec<String> = entries
            .iter()
            .filter(|(_, e)| !e.in_use)
            .map(|(k, _)| k.clone())
            .collect();

        to_remove.sort_by_key(|id| entries.get(id).map(|e| e.last_used).unwrap_or(Instant::now()));
        let remove_count = entries.len() - new_max;

        let mut removed = 0;
        for id in to_remove.iter().take(remove_count) {
            entries.remove(id);
            removed += 1;
        }

        self.max_size = new_max;

        let mut stats = self.stats.write();
        stats.total_destroyed += removed as u64;

        removed
    }

    pub fn get_stats(&self) -> PoolStats {
        let entries = self.entries.read();
        let mut stats = self.stats.read().clone();
        stats.active_count = entries.values().filter(|e| e.in_use).count();
        stats.idle_count = entries.values().filter(|e| !e.in_use).count();
        stats
    }

    pub fn len(&self) -> usize {
        self.entries.read().len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.read().is_empty()
    }
}

impl Drop for InstancePool {
    fn drop(&mut self) {
        let stats = self.stats.get_mut();
        info!(
            "InstancePool shutdown: created={}, destroyed={}, reused={}",
            stats.total_created, stats.total_destroyed, stats.total_reused
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::ModuleCache;
    use crate::sandbox::SandboxConfig;

    #[test]
    fn test_pool_creation() {
        let config = wasmtime::Config::new();
        let engine = wasmtime::Engine::new(&config).unwrap();
        let cache = Arc::new(ModuleCache::new(&engine, 10));
        let pool = InstancePool::new(&engine, 10, SandboxConfig::default(), cache);
        assert!(pool.is_empty());
        assert_eq!(pool.max_size, 10);
    }

    #[test]
    fn test_pool_stats_default() {
        let stats = PoolStats::default();
        assert_eq!(stats.total_created, 0);
        assert_eq!(stats.active_count, 0);
    }
}
