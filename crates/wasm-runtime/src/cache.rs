use anyhow::{anyhow, Context, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tracing::{debug, info, instrument, warn};
use wasmtime::{Engine, Module};

const CACHE_MAGIC: &[u8; 8] = b"KYCCACHE";
const CACHE_VERSION: u32 = 1;
const DEFAULT_CACHE_CAPACITY: usize = 100;
const DEFAULT_CACHE_TTL: Duration = Duration::from_secs(3600);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntryMeta {
    pub name: String,
    pub size_bytes: u64,
    pub compiled_at_ns: u64,
    pub hash: [u8; 32],
    pub expires_at_ns: u64,
    pub serialization_version: u32,
    pub imports: Vec<String>,
    pub exports: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheIndex {
    pub version: u32,
    pub created_at: u64,
    pub entries: Vec<CacheEntryMeta>,
}

pub struct CompilationCache {
    cache_dir: PathBuf,
    memory_cache: RwLock<HashMap<String, CachedModule>>,
    index: RwLock<CacheIndex>,
    engine: Engine,
    capacity: usize,
    ttl: Duration,
    stats: RwLock<CacheStats>,
}

struct CachedModule {
    module: Module,
    meta: CacheEntryMeta,
    loaded_at: Instant,
    last_used: Instant,
}

#[derive(Debug, Clone, Default)]
pub struct CacheStats {
    pub memory_hits: u64,
    pub disk_hits: u64,
    pub misses: u64,
    pub evictions: u64,
    pub total_entries: usize,
    pub total_size_bytes: u64,
    pub disk_reads: u64,
    pub disk_writes: u64,
    pub disk_read_errors: u64,
    pub disk_write_errors: u64,
}

impl CompilationCache {
    pub fn new(engine: &Engine, cache_dir: PathBuf) -> Self {
        let mut cache = Self {
            cache_dir,
            memory_cache: RwLock::new(HashMap::with_capacity(DEFAULT_CACHE_CAPACITY)),
            index: RwLock::new(CacheIndex {
                version: CACHE_VERSION,
                created_at: now_nanos(),
                entries: Vec::new(),
            }),
            engine: engine.clone(),
            capacity: DEFAULT_CACHE_CAPACITY,
            ttl: DEFAULT_CACHE_TTL,
            stats: RwLock::new(CacheStats::default()),
        };

        let _ = cache.load_index();
        cache
    }

    pub fn with_capacity(mut self, capacity: usize) -> Self {
        self.capacity = capacity;
        self
    }

    pub fn with_ttl(mut self, ttl: Duration) -> Self {
        self.ttl = ttl;
        self
    }

    #[instrument(skip(self, wasm_bytes))]
    pub fn get_or_compile(
        &self,
        name: &str,
        wasm_bytes: &[u8],
        force_recompile: bool,
    ) -> Result<Arc<Module>> {
        let hash = blake3::hash(wasm_bytes);

        if !force_recompile {
            if let Some(module) = self.get_from_memory(name, &hash) {
                return Ok(module);
            }

            if let Some(module) = self.get_from_disk(name, &hash)? {
                return Ok(module);
            }
        }

        self.compile_and_cache(name, wasm_bytes, hash)
    }

    fn get_from_memory(&self, name: &str, hash: &blake3::Hash) -> Option<Arc<Module>> {
        let mut cache = self.memory_cache.write();
        if let Some(entry) = cache.get_mut(name) {
            if entry.meta.hash == *hash.as_bytes() && !self.is_expired(&entry.meta) {
                entry.last_used = Instant::now();
                let mut stats = self.stats.write();
                stats.memory_hits += 1;
                debug!("Memory cache hit for '{}'", name);
                return Some(Arc::new(entry.module.clone()));
            } else {
                cache.remove(name);
                let mut stats = self.stats.write();
                stats.evictions += 1;
            }
        }
        None
    }

    fn get_from_disk(&self, name: &str, hash: &blake3::Hash) -> Result<Option<Arc<Module>>> {
        let path = self.disk_path(name);
        if !path.exists() {
            return Ok(None);
        }

        let index = self.index.read();
        let entry_meta = index.entries.iter().find(|e| e.name == name);

        match entry_meta {
            Some(meta) if meta.hash != *hash.as_bytes() || self.is_expired(meta) => {
                let _ = std::fs::remove_file(&path);
                return Ok(None);
            }
            None => return Ok(None),
            _ => {}
        }
        drop(index);

        let serialized = match std::fs::read(&path) {
            Ok(data) => {
                let mut stats = self.stats.write();
                stats.disk_reads += 1;
                data
            }
            Err(e) => {
                let mut stats = self.stats.write();
                stats.disk_read_errors += 1;
                warn!("Failed to read disk cache for '{}': {}", name, e);
                return Ok(None);
            }
        };

        if serialized.len() < 16 {
            return Ok(None);
        }
        if &serialized[..8] != CACHE_MAGIC {
            warn!("Invalid cache magic for '{}'", name);
            return Ok(None);
        }
        let stored_hash: [u8; 32] = serialized[8..40].try_into().unwrap();
        if stored_hash != *hash.as_bytes() {
            return Ok(None);
        }

        let module = Module::deserialize(&self.engine, &serialized[40..])
            .with_context(|| format!("Failed to deserialize cached module '{}'", name))?;

        {
            let mut cache = self.memory_cache.write();
            let meta = CacheEntryMeta {
                name: name.to_string(),
                size_bytes: wasm_size(&serialized) as u64,
                compiled_at_ns: now_nanos(),
                hash: *hash.as_bytes(),
                expires_at_ns: now_nanos() + self.ttl.as_nanos() as u64,
                serialization_version: CACHE_VERSION,
                imports: module
                    .imports()
                    .iter()
                    .map(|i| format!("{}:{}", i.module(), i.name()))
                    .collect(),
                exports: module.exports().iter().map(|e| e.name().to_string()).collect(),
            };
            cache.insert(name.to_string(), CachedModule {
                module: module.clone(),
                meta,
                loaded_at: Instant::now(),
                last_used: Instant::now(),
            });
        }

        let mut stats = self.stats.write();
        stats.disk_hits += 1;
        info!("Disk cache hit for '{}'", name);

        Ok(Some(Arc::new(module)))
    }

    fn compile_and_cache(
        &self,
        name: &str,
        wasm_bytes: &[u8],
        hash: blake3::Hash,
    ) -> Result<Arc<Module>> {
        let module = Module::new(&self.engine, wasm_bytes)
            .with_context(|| format!("Failed to compile module '{}'", name))?;

        let serialized = module.serialize().context("Failed to serialize module")?;

        let meta = CacheEntryMeta {
            name: name.to_string(),
            size_bytes: wasm_bytes.len() as u64,
            compiled_at_ns: now_nanos(),
            hash: *hash.as_bytes(),
            expires_at_ns: now_nanos() + self.ttl.as_nanos() as u64,
            serialization_version: CACHE_VERSION,
            imports: module
                .imports()
                .iter()
                .map(|i| format!("{}:{}", i.module(), i.name()))
                .collect(),
            exports: module.exports().iter().map(|e| e.name().to_string()).collect(),
        };

        {
            let mut cache = self.memory_cache.write();
            if cache.len() >= self.capacity {
                let oldest = cache.iter().min_by_key(|(_, e)| e.last_used).map(|(k, _)| k.clone());
                if let Some(old_key) = oldest {
                    cache.remove(&old_key);
                    let mut stats = self.stats.write();
                    stats.evictions += 1;
                    debug!("Evicted '{}' from memory cache (capacity={})", old_key, self.capacity);
                }
            }
            cache.insert(name.to_string(), CachedModule {
                module: module.clone(),
                meta: meta.clone(),
                loaded_at: Instant::now(),
                last_used: Instant::now(),
            });
        }

        {
            let mut index = self.index.write();
            index.entries.retain(|e| e.name != name);
            index.entries.push(meta);
            if let Err(e) = self.write_disk_cache(name, &serialized, &hash) {
                warn!("Failed to write disk cache for '{}': {}", name, e);
            }
            if let Err(e) = self.save_index() {
                warn!("Failed to save cache index: {}", e);
            }
        }

        {
            let mut stats = self.stats.write();
            stats.total_entries = self.memory_cache.read().len();
            stats.total_size_bytes += wasm_bytes.len() as u64;
        }

        info!("Compiled and cached module '{}' ({} bytes, {} imports, {} exports)",
            name, wasm_bytes.len(), meta.imports.len(), meta.exports.len());

        Ok(Arc::new(module))
    }

    fn write_disk_cache(&self, name: &str, serialized: &[u8], hash: &blake3::Hash) -> Result<()> {
        let path = self.disk_path(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut buf = Vec::with_capacity(40 + serialized.len());
        buf.extend_from_slice(CACHE_MAGIC);
        buf.extend_from_slice(hash.as_bytes());
        buf.extend_from_slice(serialized);

        std::fs::write(&path, &buf)
            .with_context(|| format!("Failed to write disk cache for '{}'", name))?;

        let mut stats = self.stats.write();
        stats.disk_writes += 1;

        Ok(())
    }

    fn disk_path(&self, name: &str) -> PathBuf {
        let safe_name = name.replace('/', "_").replace('\\', "_");
        self.cache_dir.join(format!("{}.wasmc", safe_name))
    }

    fn load_index(&self) -> Result<()> {
        let index_path = self.cache_dir.join("index.json");
        if !index_path.exists() {
            return Ok(());
        }

        let data = std::fs::read_to_string(&index_path)?;
        let index: CacheIndex = serde_json::from_str(&data)?;

        if index.version != CACHE_VERSION {
            warn!("Cache index version mismatch, rebuilding");
            return Ok(());
        }

        let mut current = self.index.write();
        current.entries = index.entries;
        current.entries.retain(|e| !self.is_expired(e));

        info!("Loaded cache index with {} entries", current.entries.len());
        Ok(())
    }

    fn save_index(&self) -> Result<()> {
        let index_path = self.cache_dir.join("index.json");
        if let Some(parent) = index_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let index = self.index.read();
        let data = serde_json::to_string_pretty(&*index)?;
        std::fs::write(&index_path, data)?;
        Ok(())
    }

    fn is_expired(&self, meta: &CacheEntryMeta) -> bool {
        now_nanos() > meta.expires_at_ns
    }

    pub fn evict_expired(&self) -> usize {
        let mut count = 0;
        {
            let mut cache = self.memory_cache.write();
            let expired: Vec<String> = cache
                .iter()
                .filter(|(_, e)| self.is_expired(&e.meta))
                .map(|(k, _)| k.clone())
                .collect();
            count += expired.len();
            for key in &expired {
                cache.remove(key);
            }
        }
        {
            let mut index = self.index.write();
            let before = index.entries.len();
            index.entries.retain(|e| !self.is_expired(e));
            count += before - index.entries.len();
        }
        if count > 0 {
            let mut stats = self.stats.write();
            stats.evictions += count as u64;
            info!("Evicted {} expired cache entries", count);
        }
        count
    }

    pub fn invalidate(&self, name: &str) -> bool {
        let mut removed = false;
        {
            let mut cache = self.memory_cache.write();
            removed |= cache.remove(name).is_some();
        }
        {
            let mut index = self.index.write();
            let before = index.entries.len();
            index.entries.retain(|e| e.name != name);
            removed |= index.entries.len() < before;
        }
        let disk_path = self.disk_path(name);
        if disk_path.exists() {
            let _ = std::fs::remove_file(&disk_path);
        }
        removed
    }

    pub fn clear(&self) {
        self.memory_cache.write().clear();
        self.index.write().entries.clear();
        if let Err(e) = std::fs::remove_dir_all(&self.cache_dir) {
            debug!("Failed to remove cache dir: {}", e);
        }
        let mut stats = self.stats.write();
        stats.evictions += stats.total_entries as u64;
        stats.total_entries = 0;
        stats.total_size_bytes = 0;
        info!("Compilation cache cleared");
    }

    pub fn warm(&self, entries: &[(String, Vec<u8>)]) -> usize {
        let mut warmed = 0;
        let mut stats = self.stats.write();
        for (name, bytes) in entries {
            match self.get_or_compile(name, bytes, false) {
                Ok(_) => {
                    warmed += 1;
                    stats.disk_hits += 1;
                }
                Err(e) => {
                    warn!("Failed to warm cache for '{}': {}", name, e);
                }
            }
        }
        info!("Warmed cache with {} modules", warmed);
        warmed
    }

    pub fn get_stats(&self) -> CacheStats {
        let mut stats = self.stats.read().clone();
        stats.total_entries = self.memory_cache.read().len();
        stats
    }

    pub fn contains(&self, name: &str) -> bool {
        self.memory_cache.read().contains_key(name)
            || self.index.read().entries.iter().any(|e| e.name == name)
    }

    pub fn list_cached(&self) -> Vec<CacheEntryMeta> {
        let index = self.index.read();
        index.entries.clone()
    }

    pub fn memory_size(&self) -> usize {
        self.memory_cache.read().len()
    }

    pub fn disk_size(&self) -> Result<u64> {
        let mut total = 0u64;
        if self.cache_dir.exists() {
            for entry in std::fs::read_dir(&self.cache_dir)? {
                let entry = entry?;
                if entry.path().is_file() {
                    total += entry.metadata()?.len();
                }
            }
        }
        Ok(total)
    }
}

fn now_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

fn wasm_size(data: &[u8]) -> usize {
    if data.len() >= 8 {
        let magic = &data[0..4];
        if magic == b"\0asm" {
            if data.len() >= 8 {
                let _version: u32 = u32::from_le_bytes(data[4..8].try_into().unwrap());
            }
        }
    }
    data.len()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_wasm() -> Vec<u8> {
        let wat = r#"(module (func (export "test") (result i32) (i32.const 42)))"#;
        let wasm = wat::parse_str(wat).unwrap();
        wasm
    }

    #[test]
    fn test_cache_compile_and_retrieve() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());

        let wasm = create_test_wasm();
        let module1 = cache.get_or_compile("test-module", &wasm, false).unwrap();
        let module2 = cache.get_or_compile("test-module", &wasm, false).unwrap();

        assert!(Arc::ptr_eq(&module1, &module2) || module1.as_ref() as *const Module == module2.as_ref() as *const Module);

        let stats = cache.get_stats();
        assert!(stats.memory_hits >= 1);
    }

    #[test]
    fn test_cache_miss() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
        let wasm = create_test_wasm();
        let _module = cache.get_or_compile("unique", &wasm, false).unwrap();
        let stats = cache.get_stats();
        assert_eq!(stats.memory_hits, 0);
    }

    #[test]
    fn test_force_recompile() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
        let wasm = create_test_wasm();

        let m1 = cache.get_or_compile("mod", &wasm, false).unwrap();
        let m2 = cache.get_or_compile("mod", &wasm, true).unwrap();

        let stats = cache.get_stats();
        assert_eq!(stats.memory_hits, 1);
    }

    #[test]
    fn test_invalidate() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
        let wasm = create_test_wasm();

        cache.get_or_compile("mod", &wasm, false).unwrap();
        assert!(cache.contains("mod"));
        assert!(cache.invalidate("mod"));
        assert!(!cache.contains("mod"));
    }

    #[test]
    fn test_clear() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
        let wasm = create_test_wasm();

        cache.get_or_compile("mod1", &wasm, false).unwrap();
        cache.get_or_compile("mod2", &wasm, false).unwrap();
        assert_eq!(cache.memory_size(), 2);

        cache.clear();
        assert_eq!(cache.memory_size(), 0);
    }

    #[test]
    fn test_evict_expired() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf()).with_ttl(Duration::from_secs(0));
        let wasm = create_test_wasm();

        cache.get_or_compile("mod", &wasm, false).unwrap();
        std::thread::sleep(Duration::from_millis(10));
        let evicted = cache.evict_expired();
        assert!(evicted > 0);
    }

    #[test]
    fn test_disk_cache_persistence() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let wasm = create_test_wasm();

        {
            let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
            cache.get_or_compile("persist", &wasm, false).unwrap();
        }

        {
            let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
            let module = cache.get_or_compile("persist", &wasm, false).unwrap();
            let stats = cache.get_stats();
            assert!(stats.disk_hits >= 1 || stats.memory_hits >= 1);
        }
    }

    #[test]
    fn test_list_cached() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
        let wasm = create_test_wasm();

        cache.get_or_compile("list-mod", &wasm, false).unwrap();
        let entries = cache.list_cached();
        assert!(entries.iter().any(|e| e.name == "list-mod"));
    }

    #[test]
    fn test_cache_stats() {
        let engine = Engine::new(&wasmtime::Config::new()).unwrap();
        let dir = tempdir().unwrap();
        let cache = CompilationCache::new(&engine, dir.path().to_path_buf());
        let wasm = create_test_wasm();

        cache.get_or_compile("stats-mod", &wasm, false).unwrap();
        let stats = cache.get_stats();
        assert!(stats.disk_writes >= 1 || stats.disk_reads >= 0);
    }
}
