use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default)]
pub struct ModuleMetrics {
    pub name: String,
    pub invocation_count: u64,
    pub total_fuel_consumed: u64,
    pub total_execution_time_ns: u128,
    pub max_execution_time_ns: u128,
    pub min_execution_time_ns: u128,
    pub total_memory_allocated: u64,
    pub error_count: u64,
    pub last_invoked_at: Option<Instant>,
    pub created_at: Instant,
}

#[derive(Debug, Clone, Default)]
pub struct ModuleMetricsSnapshot {
    pub name: String,
    pub invocation_count: u64,
    pub total_fuel_consumed: u64,
    pub avg_execution_time_ms: f64,
    pub max_execution_time_ms: f64,
    pub min_execution_time_ms: f64,
    pub error_count: u64,
    pub error_rate: f64,
    pub last_invoked_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct GlobalMetrics {
    pub total_runtime_ns: u128,
    pub active_instances: u64,
    pub total_instances_created: u64,
    pub total_instances_destroyed: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub policy_evaluations: u64,
    pub policy_denials: u64,
    pub module_loads: u64,
    pub module_load_errors: u64,
    pub host_function_calls: u64,
    pub start_time: Instant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsReport {
    pub timestamp: String,
    pub uptime_seconds: u64,
    pub global: GlobalMetricsSnapshot,
    pub modules: Vec<ModuleMetricsSnapshot>,
    pub top_errors: Vec<ErrorRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalMetricsSnapshot {
    pub total_runtime_seconds: f64,
    pub active_instances: u64,
    pub total_instances_created: u64,
    pub total_instances_destroyed: u64,
    pub cache_hit_rate: f64,
    pub policy_evaluation_rate: f64,
    pub policy_denial_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorRecord {
    pub module_name: String,
    pub error_message: String,
    pub count: u64,
    pub last_seen: String,
}

pub struct MetricsCollector {
    module_metrics: RwLock<HashMap<String, ModuleMetrics>>,
    global: RwLock<GlobalMetrics>,
    errors: RwLock<Vec<ErrorRecord>>,
    max_errors: usize,
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            module_metrics: RwLock::new(HashMap::new()),
            global: RwLock::new(GlobalMetrics {
                start_time: Instant::now(),
                ..Default::default()
            }),
            errors: RwLock::new(Vec::with_capacity(100)),
            max_errors: 1000,
        }
    }

    pub fn record_invocation(
        &self,
        module_name: &str,
        fuel_consumed: u64,
        execution_time: Duration,
        memory_allocated: u64,
        success: bool,
    ) {
        let exec_ns = execution_time.as_nanos();
        let mut modules = self.module_metrics.write();
        let metrics = modules.entry(module_name.to_string()).or_insert_with(|| {
            ModuleMetrics {
                name: module_name.to_string(),
                created_at: Instant::now(),
                min_execution_time_ns: exec_ns,
                ..Default::default()
            }
        });
        metrics.invocation_count += 1;
        metrics.total_fuel_consumed = metrics.total_fuel_consumed.saturating_add(fuel_consumed);
        metrics.total_execution_time_ns = metrics.total_execution_time_ns.saturating_add(exec_ns);
        metrics.max_execution_time_ns = metrics.max_execution_time_ns.max(exec_ns);
        metrics.min_execution_time_ns = metrics.min_execution_time_ns.min(exec_ns);
        metrics.total_memory_allocated = metrics.total_memory_allocated.saturating_add(memory_allocated);
        metrics.last_invoked_at = Some(Instant::now());
        if !success {
            metrics.error_count += 1;
        }
        let mut global = self.global.write();
        global.host_function_calls += 1;
        global.total_runtime_ns = global.total_runtime_ns.saturating_add(exec_ns);
    }

    pub fn record_module_load(&self, success: bool) {
        let mut global = self.global.write();
        if success { global.module_loads += 1; } else { global.module_load_errors += 1; }
    }

    pub fn record_instance_created(&self) {
        let mut global = self.global.write();
        global.total_instances_created += 1;
        global.active_instances += 1;
    }

    pub fn record_instance_destroyed(&self) {
        let mut global = self.global.write();
        global.total_instances_destroyed += 1;
        global.active_instances = global.active_instances.saturating_sub(1);
    }

    pub fn record_cache_hit(&self) { self.global.write().cache_hits += 1; }
    pub fn record_cache_miss(&self) { self.global.write().cache_misses += 1; }

    pub fn record_policy_evaluation(&self, denied: bool) {
        let mut global = self.global.write();
        global.policy_evaluations += 1;
        if denied { global.policy_denials += 1; }
    }

    pub fn record_error(&self, module_name: &str, error_message: String) {
        let mut errors = self.errors.write();
        if let Some(record) = errors.iter_mut().find(|e| {
            e.module_name == module_name && e.error_message == error_message
        }) {
            record.count += 1;
            record.last_seen = chrono::Utc::now().to_rfc3339();
        } else {
            if errors.len() >= self.max_errors { errors.remove(0); }
            errors.push(ErrorRecord {
                module_name: module_name.to_string(),
                error_message,
                count: 1,
                last_seen: chrono::Utc::now().to_rfc3339(),
            });
        }
    }

    pub fn get_module_metrics(&self, module_name: &str) -> Option<ModuleMetricsSnapshot> {
        self.module_metrics.read().get(module_name).map(|m| m.snapshot())
    }

    pub fn get_all_module_metrics(&self) -> Vec<ModuleMetricsSnapshot> {
        self.module_metrics.read().values().map(|m| m.snapshot()).collect()
    }

    pub fn get_global_metrics(&self) -> GlobalMetricsSnapshot {
        let global = self.global.read();
        let total_cache = global.cache_hits + global.cache_misses;
        let uptime = global.start_time.elapsed().as_secs_f64();
        GlobalMetricsSnapshot {
            total_runtime_seconds: global.total_runtime_ns as f64 / 1_000_000_000.0,
            active_instances: global.active_instances,
            total_instances_created: global.total_instances_created,
            total_instances_destroyed: global.total_instances_destroyed,
            cache_hit_rate: if total_cache > 0 { global.cache_hits as f64 / total_cache as f64 } else { 0.0 },
            policy_evaluation_rate: if uptime > 0.0 { global.policy_evaluations as f64 / uptime } else { 0.0 },
            policy_denial_rate: if global.policy_evaluations > 0 { global.policy_denials as f64 / global.policy_evaluations as f64 } else { 0.0 },
        }
    }

    pub fn get_errors(&self, top_n: usize) -> Vec<ErrorRecord> {
        let mut errors = self.errors.read().clone();
        errors.sort_by(|a, b| b.count.cmp(&a.count));
        errors.truncate(top_n);
        errors
    }

    pub fn generate_report(&self) -> MetricsReport {
        MetricsReport {
            timestamp: chrono::Utc::now().to_rfc3339(),
            uptime_seconds: self.global.read().start_time.elapsed().as_secs(),
            global: self.get_global_metrics(),
            modules: self.get_all_module_metrics(),
            top_errors: self.get_errors(10),
        }
    }

    pub fn reset_module_metrics(&self, module_name: &str) {
        self.module_metrics.write().remove(module_name);
    }

    pub fn reset_all(&self) {
        self.module_metrics.write().clear();
        self.errors.write().clear();
        *self.global.write() = GlobalMetrics { start_time: Instant::now(), ..Default::default() };
    }
}

impl ModuleMetrics {
    fn snapshot(&self) -> ModuleMetricsSnapshot {
        let avg_ms = if self.invocation_count > 0 {
            self.total_execution_time_ns as f64 / self.invocation_count as f64 / 1_000_000.0
        } else { 0.0 };
        ModuleMetricsSnapshot {
            name: self.name.clone(),
            invocation_count: self.invocation_count,
            total_fuel_consumed: self.total_fuel_consumed,
            avg_execution_time_ms: avg_ms,
            max_execution_time_ms: self.max_execution_time_ns as f64 / 1_000_000.0,
            min_execution_time_ms: self.min_execution_time_ns as f64 / 1_000_000.0,
            error_count: self.error_count,
            error_rate: if self.invocation_count > 0 { self.error_count as f64 / self.invocation_count as f64 } else { 0.0 },
            last_invoked_at: self.last_invoked_at.map(|_| chrono::Utc::now().to_rfc3339()),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

pub struct MetricsExporter {
    collector: Arc<MetricsCollector>,
}

impl MetricsExporter {
    pub fn new(collector: Arc<MetricsCollector>) -> Self { Self { collector } }

    pub fn export_prometheus(&self) -> String {
        let mut output = String::new();
        let global = self.collector.get_global_metrics();

        output.push_str("# HELP kyc_wasm_runtime_seconds Total runtime in seconds\n");
        output.push_str(&format!("# TYPE kyc_wasm_runtime_seconds counter\nkyc_wasm_runtime_seconds {}\n", global.total_runtime_seconds));
        output.push_str("# HELP kyc_wasm_active_instances Active instances\n");
        output.push_str(&format!("# TYPE kyc_wasm_active_instances gauge\nkyc_wasm_active_instances {}\n", global.active_instances));
        output.push_str("# HELP kyc_wasm_cache_hit_rate Cache hit rate\n");
        output.push_str(&format!("# TYPE kyc_wasm_cache_hit_rate gauge\nkyc_wasm_cache_hit_rate {}\n", global.cache_hit_rate));
        output.push_str("# HELP kyc_wasm_policy_denial_rate Policy denial rate\n");
        output.push_str(&format!("# TYPE kyc_wasm_policy_denial_rate gauge\nkyc_wasm_policy_denial_rate {}\n", global.policy_denial_rate));

        for module in self.collector.get_all_module_metrics() {
            output.push_str(&format!("# HELP kyc_wasm_module_invocations_total Total invocations for {}\n", module.name));
            output.push_str(&format!("# TYPE kyc_wasm_module_invocations_total counter\nkyc_wasm_module_invocations_total{{module=\"{}\"}} {}\n", module.name, module.invocation_count));
            output.push_str(&format!("# HELP kyc_wasm_module_avg_execution_ms Average execution time for {}\n", module.name));
            output.push_str(&format!("# TYPE kyc_wasm_module_avg_execution_ms gauge\nkyc_wasm_module_avg_execution_ms{{module=\"{}\"}} {}\n", module.name, module.avg_execution_time_ms));
            output.push_str(&format!("# HELP kyc_wasm_module_error_rate Error rate for {}\n", module.name));
            output.push_str(&format!("# TYPE kyc_wasm_module_error_rate gauge\nkyc_wasm_module_error_rate{{module=\"{}\"}} {}\n", module.name, module.error_rate));
            output.push_str(&format!("# HELP kyc_wasm_module_fuel_total Total fuel consumed by {}\n", module.name));
            output.push_str(&format!("# TYPE kyc_wasm_module_fuel_total counter\nkyc_wasm_module_fuel_total{{module=\"{}\"}} {}\n", module.name, module.total_fuel_consumed));
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_invocation() {
        let collector = MetricsCollector::new();
        collector.record_invocation("test-module", 1000, Duration::from_millis(50), 4096, true);
        let metrics = collector.get_module_metrics("test-module").unwrap();
        assert_eq!(metrics.invocation_count, 1);
        assert_eq!(metrics.total_fuel_consumed, 1000);
    }

    #[test]
    fn test_multiple_invocations() {
        let collector = MetricsCollector::new();
        collector.record_invocation("mod", 500, Duration::from_millis(10), 1024, true);
        collector.record_invocation("mod", 1500, Duration::from_millis(30), 2048, true);
        let metrics = collector.get_module_metrics("mod").unwrap();
        assert_eq!(metrics.invocation_count, 2);
        assert_eq!(metrics.total_fuel_consumed, 2000);
    }

    #[test]
    fn test_error_tracking() {
        let collector = MetricsCollector::new();
        collector.record_error("mod-a", "out of memory".into());
        collector.record_error("mod-a", "out of memory".into());
        collector.record_error("mod-b", "stack overflow".into());
        let errors = collector.get_errors(10);
        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0].count, 2);
    }

    #[test]
    fn test_global_metrics() {
        let collector = MetricsCollector::new();
        collector.record_instance_created();
        collector.record_instance_created();
        collector.record_instance_destroyed();
        collector.record_cache_hit();
        collector.record_cache_miss();
        let global = collector.get_global_metrics();
        assert_eq!(global.total_instances_created, 2);
        assert_eq!(global.active_instances, 1);
    }

    #[test]
    fn test_prometheus_export() {
        let collector = Arc::new(MetricsCollector::new());
        collector.record_invocation("test", 500, Duration::from_millis(20), 2048, true);
        let exporter = MetricsExporter::new(collector);
        let output = exporter.export_prometheus();
        assert!(output.contains("kyc_wasm_module_invocations_total"));
        assert!(output.contains("test"));
    }

    #[test]
    fn test_reset() {
        let collector = MetricsCollector::new();
        collector.record_invocation("mod", 100, Duration::from_millis(5), 512, true);
        assert!(collector.get_module_metrics("mod").is_some());
        collector.reset_module_metrics("mod");
        assert!(collector.get_module_metrics("mod").is_none());
    }

    #[test]
    fn test_report_generation() {
        let collector = MetricsCollector::new();
        collector.record_invocation("mod", 100, Duration::from_millis(5), 512, true);
        let report = collector.generate_report();
        assert_eq!(report.modules.len(), 1);
        assert_eq!(report.modules[0].name, "mod");
    }
}
