use std::collections::HashSet;
use std::time::Duration;
use wasmtime::{StoreLimits, StoreLimitsBuilder};

#[derive(Debug, Clone)]
pub enum Capability {
    Network,
    Filesystem,
    Environment,
    Clock,
    Random,
    Crypto,
    KeyValue,
    Http,
    Stdin,
    Stdout,
    Stderr,
    Custom(String),
}

impl Capability {
    pub fn as_str(&self) -> &str {
        match self {
            Capability::Network => "network",
            Capability::Filesystem => "filesystem",
            Capability::Environment => "environment",
            Capability::Clock => "clock",
            Capability::Random => "random",
            Capability::Crypto => "crypto",
            Capability::KeyValue => "kv",
            Capability::Http => "http",
            Capability::Stdin => "stdin",
            Capability::Stdout => "stdout",
            Capability::Stderr => "stderr",
            Capability::Custom(s) => s,
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "network" => Capability::Network,
            "filesystem" => Capability::Filesystem,
            "environment" => Capability::Environment,
            "clock" => Capability::Clock,
            "random" => Capability::Random,
            "crypto" => Capability::Crypto,
            "kv" => Capability::KeyValue,
            "http" => Capability::Http,
            "stdin" => Capability::Stdin,
            "stdout" => Capability::Stdout,
            "stderr" => Capability::Stderr,
            other => Capability::Custom(other.to_string()),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SandboxConfig {
    pub max_memory_bytes: u64,
    pub max_fuel: u64,
    pub max_cpu_time: Option<Duration>,
    pub max_module_size: Option<usize>,
    pub max_stack_size: Option<u64>,
    pub max_instances: usize,
    pub max_tables: u32,
    pub max_memories: u32,
    pub allowed_capabilities: HashSet<Capability>,
    pub trap_on_grow_failure: bool,
    pub allow_wasi: bool,
    pub allow_simd: bool,
    pub allow_bulk_memory: bool,
    pub allow_reference_types: bool,
    pub allow_multi_value: bool,
    pub allow_tail_call: bool,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        let mut capabilities = HashSet::new();
        capabilities.insert(Capability::Random);
        capabilities.insert(Capability::Clock);
        capabilities.insert(Capability::Stdout);
        capabilities.insert(Capability::Stderr);

        Self {
            max_memory_bytes: 10 * 1024 * 1024,
            max_fuel: 1_000_000,
            max_cpu_time: Some(Duration::from_secs(5)),
            max_module_size: Some(5 * 1024 * 1024),
            max_stack_size: Some(512 * 1024),
            max_instances: 100,
            max_tables: 10,
            max_memories: 4,
            allowed_capabilities: capabilities,
            trap_on_grow_failure: true,
            allow_wasi: false,
            allow_simd: true,
            allow_bulk_memory: true,
            allow_reference_types: true,
            allow_multi_value: true,
            allow_tail_call: false,
        }
    }
}

impl SandboxConfig {
    pub fn restricted() -> Self {
        Self {
            allowed_capabilities: HashSet::new(),
            max_memory_bytes: 1 * 1024 * 1024,
            max_fuel: 100_000,
            max_cpu_time: Some(Duration::from_secs(1)),
            allow_wasi: false,
            ..Default::default()
        }
    }

    pub fn full() -> Self {
        let mut capabilities = HashSet::new();
        capabilities.insert(Capability::Network);
        capabilities.insert(Capability::Filesystem);
        capabilities.insert(Capability::Environment);
        capabilities.insert(Capability::Clock);
        capabilities.insert(Capability::Random);
        capabilities.insert(Capability::Crypto);
        capabilities.insert(Capability::KeyValue);
        capabilities.insert(Capability::Http);
        capabilities.insert(Capability::Stdout);
        capabilities.insert(Capability::Stderr);

        Self {
            max_memory_bytes: 50 * 1024 * 1024,
            max_fuel: 10_000_000,
            max_cpu_time: Some(Duration::from_secs(30)),
            max_instances: 500,
            max_tables: 20,
            max_memories: 8,
            allowed_capabilities: capabilities,
            allow_wasi: true,
            ..Default::default()
        }
    }

    pub fn build_store_limits(&self) -> StoreLimits {
        StoreLimitsBuilder::new()
            .memory_size(self.max_memory_bytes as usize)
            .memories(self.max_memories)
            .trap_on_grow_failure(self.trap_on_grow_failure)
            .build()
    }

    pub fn has_capability(&self, cap: &Capability) -> bool {
        self.allowed_capabilities.contains(cap)
    }

    pub fn add_capability(&mut self, cap: Capability) {
        self.allowed_capabilities.insert(cap);
    }

    pub fn remove_capability(&mut self, cap: &Capability) {
        self.allowed_capabilities.remove(cap);
    }

    pub fn configure_wasmtime(&self, config: &mut wasmtime::Config) {
        config.wasm_multi_value(self.allow_multi_value);
        config.wasm_bulk_memory(self.allow_bulk_memory);
        config.wasm_reference_types(self.allow_reference_types);
        config.wasm_simd(self.allow_simd);
        config.wasm_tail_call(self.allow_tail_call);
        config.consume_fuel(true);
    }
}

#[derive(Debug, Clone)]
pub struct ResourceUsage {
    pub memory_bytes: u64,
    pub fuel_consumed: u64,
    pub cpu_time: Duration,
    pub table_elements: u32,
    pub instances_count: usize,
}

impl ResourceUsage {
    pub fn exceeded_limits(&self, config: &SandboxConfig) -> Vec<String> {
        let mut violations = Vec::new();
        if self.memory_bytes > config.max_memory_bytes {
            violations.push(format!(
                "memory {} > {}",
                self.memory_bytes, config.max_memory_bytes
            ));
        }
        if self.fuel_consumed > config.max_fuel {
            violations.push(format!(
                "fuel {} > {}",
                self.fuel_consumed, config.max_fuel
            ));
        }
        if let Some(max_cpu) = config.max_cpu_time {
            if self.cpu_time > max_cpu {
                violations.push(format!(
                    "cpu_time {:?} > {:?}",
                    self.cpu_time, max_cpu
                ));
            }
        }
        violations
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = SandboxConfig::default();
        assert_eq!(config.max_memory_bytes, 10 * 1024 * 1024);
        assert_eq!(config.max_fuel, 1_000_000);
        assert!(config.has_capability(&Capability::Random));
        assert!(!config.has_capability(&Capability::Network));
    }

    #[test]
    fn test_restricted_config() {
        let config = SandboxConfig::restricted();
        assert_eq!(config.max_memory_bytes, 1 * 1024 * 1024);
        assert!(config.allowed_capabilities.is_empty());
    }

    #[test]
    fn test_full_config() {
        let config = SandboxConfig::full();
        assert!(config.has_capability(&Capability::Network));
        assert!(config.has_capability(&Capability::Crypto));
        assert!(config.allow_wasi);
    }

    #[test]
    fn test_resource_violations() {
        let config = SandboxConfig::default();
        let usage = ResourceUsage {
            memory_bytes: 100 * 1024 * 1024,
            fuel_consumed: 2_000_000,
            cpu_time: Duration::from_secs(10),
            table_elements: 0,
            instances_count: 0,
        };
        let violations = usage.exceeded_limits(&config);
        assert!(!violations.is_empty());
    }

    #[test]
    fn test_capability_add_remove() {
        let mut config = SandboxConfig::default();
        assert!(!config.has_capability(&Capability::Http));
        config.add_capability(Capability::Http);
        assert!(config.has_capability(&Capability::Http));
        config.remove_capability(&Capability::Http);
        assert!(!config.has_capability(&Capability::Http));
    }
}
