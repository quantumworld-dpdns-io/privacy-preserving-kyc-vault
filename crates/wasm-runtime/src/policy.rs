use crate::sandbox::{Capability, SandboxConfig};
use anyhow::{anyhow, Result};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, instrument, warn};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Effect {
    Allow,
    Deny,
    Audit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub id: String,
    pub description: String,
    pub module_name: Option<String>,
    pub action: PolicyAction,
    pub effect: Effect,
    pub priority: i32,
    pub conditions: Vec<PolicyCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PolicyAction {
    Instantiate,
    Import(String, String),
    Export(String),
    MemoryGrow,
    FuelConsume,
    CapabilityUse(Capability),
    NetworkAccess(String),
    FileSystemAccess(String),
    HostFunction(String),
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyCondition {
    pub attribute: String,
    pub operator: ConditionOperator,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConditionOperator {
    Equals,
    NotEquals,
    Contains,
    Matches,
    GreaterThan,
    LessThan,
    InList,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyEvaluation {
    pub rule_id: String,
    pub action: String,
    pub effect: Effect,
    pub matched_at: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyStats {
    pub total_evaluations: u64,
    pub allowed_count: u64,
    pub denied_count: u64,
    pub audited_count: u64,
    pub avg_evaluation_ns: f64,
}

pub struct PolicyEngine {
    rules: Vec<PolicyRule>,
    stats: RwLock<PolicyStats>,
    cache: RwLock<HashMap<String, (Effect, Instant)>>,
    cache_ttl: Duration,
    evaluation_timeout: Duration,
}

impl Default for PolicyEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl PolicyEngine {
    pub fn new() -> Self {
        let rules = vec![
            PolicyRule {
                id: "default-deny-all".into(),
                description: "Default deny all actions".into(),
                module_name: None,
                action: PolicyAction::Custom("*".into()),
                effect: Effect::Deny,
                priority: 0,
                conditions: vec![],
            },
            PolicyRule {
                id: "allow-credential-verify".into(),
                description: "Allow credential-verify module instantiation".into(),
                module_name: Some("credential-verify".into()),
                action: PolicyAction::Instantiate,
                effect: Effect::Allow,
                priority: 100,
                conditions: vec![],
            },
            PolicyRule {
                id: "allow-did-resolve".into(),
                description: "Allow did-resolve module instantiation".into(),
                module_name: Some("did-resolve".into()),
                action: PolicyAction::Instantiate,
                effect: Effect::Allow,
                priority: 100,
                conditions: vec![],
            },
            PolicyRule {
                id: "allow-age-proof".into(),
                description: "Allow age-proof module instantiation".into(),
                module_name: Some("age-proof".into()),
                action: PolicyAction::Instantiate,
                effect: Effect::Allow,
                priority: 100,
                conditions: vec![],
            },
            PolicyRule {
                id: "audit-network-access".into(),
                description: "Audit all network access from Wasm modules".into(),
                module_name: None,
                action: PolicyAction::NetworkAccess("*".into()),
                effect: Effect::Audit,
                priority: 50,
                conditions: vec![],
            },
            PolicyRule {
                id: "deny-filesystem-external".into(),
                description: "Deny filesystem access outside /tmp".into(),
                module_name: None,
                action: PolicyAction::FileSystemAccess("/tmp/*".into()),
                effect: Effect::Deny,
                priority: 90,
                conditions: vec![PolicyCondition {
                    attribute: "path".into(),
                    operator: ConditionOperator::Matches,
                    value: r"^(?!/tmp/).*".into(),
                }],
            },
        ];

        Self {
            rules,
            stats: RwLock::new(PolicyStats::default()),
            cache: RwLock::new(HashMap::new()),
            cache_ttl: Duration::from_secs(60),
            evaluation_timeout: Duration::from_millis(50),
        }
    }

    pub fn with_rules(mut self, rules: Vec<PolicyRule>) -> Self {
        self.rules = rules;
        self
    }

    pub fn add_rule(&mut self, rule: PolicyRule) {
        self.rules.push(rule);
        self.rules.sort_by(|a, b| b.priority.cmp(&a.priority));
    }

    pub fn remove_rule(&mut self, rule_id: &str) -> bool {
        let before = self.rules.len();
        self.rules.retain(|r| r.id != rule_id);
        self.rules.len() < before
    }

    #[instrument(skip(self))]
    pub fn evaluate(
        &self,
        module_name: &str,
        action: &PolicyAction,
        context: &HashMap<String, String>,
    ) -> Result<PolicyEvaluation> {
        let start = Instant::now();

        let cache_key = format!("{}:{:?}:{:?}", module_name, action, context);
        {
            let cache = self.cache.read();
            if let Some((effect, expiry)) = cache.get(&cache_key) {
                if expiry.elapsed() < self.cache_ttl {
                    let mut stats = self.stats.write();
                    stats.total_evaluations += 1;
                    match effect {
                        Effect::Allow => stats.allowed_count += 1,
                        Effect::Deny => stats.denied_count += 1,
                        Effect::Audit => stats.audited_count += 1,
                    }
                    return Ok(PolicyEvaluation {
                        rule_id: "cache".into(),
                        action: format!("{:?}", action),
                        effect: effect.clone(),
                        matched_at: chrono::Utc::now().to_rfc3339(),
                        detail: "cached evaluation".into(),
                    });
                }
            }
        }

        let mut matched_rule: Option<&PolicyRule> = None;

        for rule in &self.rules {
            if let Some(ref rule_module) = rule.module_name {
                if rule_module != module_name && rule_module != "*" {
                    continue;
                }
            }

            if !self.action_matches(&rule.action, action) {
                continue;
            }

            if !self.evaluate_conditions(&rule.conditions, context) {
                continue;
            }

            matched_rule = Some(rule);
            break;
        }

        let rule = matched_rule.ok_or_else(|| {
            anyhow!("no matching policy rule for action {:?} on module '{}'", action, module_name)
        })?;

        let evaluation = PolicyEvaluation {
            rule_id: rule.id.clone(),
            action: format!("{:?}", action),
            effect: rule.effect.clone(),
            matched_at: chrono::Utc::now().to_rfc3339(),
            detail: rule.description.clone(),
        };

        {
            let mut cache = self.cache.write();
            cache.insert(cache_key, (rule.effect.clone(), Instant::now()));
        }

        let elapsed = start.elapsed().as_nanos() as f64;
        let mut stats = self.stats.write();
        stats.total_evaluations += 1;
        match &evaluation.effect {
            Effect::Allow => stats.allowed_count += 1,
            Effect::Deny => stats.denied_count += 1,
            Effect::Audit => stats.audited_count += 1,
        }
        stats.avg_evaluation_ns = (stats.avg_evaluation_ns * (stats.total_evaluations - 1) as f64 + elapsed) / stats.total_evaluations as f64;

        match &evaluation.effect {
            Effect::Deny => {
                warn!(
                    "Policy DENY: module='{}' action={:?} rule='{}' context={:?}",
                    module_name, action, rule.id, context
                );
            }
            Effect::Audit => {
                debug!(
                    "Policy AUDIT: module='{}' action={:?} rule='{}'",
                    module_name, action, rule.id
                );
            }
            Effect::Allow => {
                debug!(
                    "Policy ALLOW: module='{}' action={:?} rule='{}'",
                    module_name, action, rule.id
                );
            }
        }

        Ok(evaluation)
    }

    pub fn evaluate_instantiate(&self, module_name: &str) -> Result<PolicyEvaluation> {
        self.evaluate(module_name, &PolicyAction::Instantiate, &HashMap::new())
    }

    pub fn evaluate_import(
        &self,
        module_name: &str,
        import_module: &str,
        import_name: &str,
    ) -> Result<PolicyEvaluation> {
        let mut context = HashMap::new();
        context.insert("import_module".into(), import_module.to_string());
        context.insert("import_name".into(), import_name.to_string());
        self.evaluate(module_name, &PolicyAction::Import(import_module.into(), import_name.into()), &context)
    }

    pub fn evaluate_export(&self, module_name: &str, export_name: &str) -> Result<PolicyEvaluation> {
        let mut context = HashMap::new();
        context.insert("export_name".into(), export_name.to_string());
        self.evaluate(module_name, &PolicyAction::Export(export_name.into()), &context)
    }

    pub fn evaluate_host_function(&self, module_name: &str, func_name: &str) -> Result<PolicyEvaluation> {
        let mut context = HashMap::new();
        context.insert("function".into(), func_name.to_string());
        self.evaluate(module_name, &PolicyAction::HostFunction(func_name.into()), &context)
    }

    pub fn evaluate_capability(&self, module_name: &str, cap: &Capability) -> Result<PolicyEvaluation> {
        let mut context = HashMap::new();
        context.insert("capability".into(), cap.as_str().to_string());
        self.evaluate(module_name, &PolicyAction::CapabilityUse(cap.clone()), &context)
    }

    fn action_matches(&self, rule_action: &PolicyAction, target_action: &PolicyAction) -> bool {
        match (rule_action, target_action) {
            (PolicyAction::Custom(wildcard), _) if wildcard == "*" => true,
            (a, b) if a == b => true,
            (PolicyAction::Import(rm, rn), PolicyAction::Import(tm, tn)) => {
                (rm == "*" || rm == tm) && (rn == "*" || rn == tn)
            }
            (PolicyAction::Export(r), PolicyAction::Export(t)) => r == "*" || r == t,
            (PolicyAction::NetworkAccess(r), PolicyAction::NetworkAccess(t)) => r == "*" || r == t,
            (PolicyAction::FileSystemAccess(r), PolicyAction::FileSystemAccess(t)) => r == "*" || r == t,
            (PolicyAction::HostFunction(r), PolicyAction::HostFunction(t)) => r == "*" || r == t,
            _ => false,
        }
    }

    fn evaluate_conditions(&self, conditions: &[PolicyCondition], context: &HashMap<String, String>) -> bool {
        if conditions.is_empty() {
            return true;
        }

        for condition in conditions {
            let actual = match context.get(&condition.attribute) {
                Some(v) => v,
                None => return false,
            };

            let passed = match &condition.operator {
                ConditionOperator::Equals => actual == &condition.value,
                ConditionOperator::NotEquals => actual != &condition.value,
                ConditionOperator::Contains => actual.contains(&condition.value),
                ConditionOperator::Matches => {
                    if let Ok(re) = regex::Regex::new(&condition.value) {
                        re.is_match(actual)
                    } else {
                        false
                    }
                }
                ConditionOperator::GreaterThan => {
                    actual.parse::<f64>().ok()
                        .zip(condition.value.parse::<f64>().ok())
                        .map(|(a, b)| a > b)
                        .unwrap_or(false)
                }
                ConditionOperator::LessThan => {
                    actual.parse::<f64>().ok()
                        .zip(condition.value.parse::<f64>().ok())
                        .map(|(a, b)| a < b)
                        .unwrap_or(false)
                }
                ConditionOperator::InList => {
                    condition.value.split(',').any(|item| item.trim() == actual.as_str())
                }
            };

            if !passed {
                return false;
            }
        }

        true
    }

    pub fn get_applicable_rules(&self, module_name: &str) -> Vec<&PolicyRule> {
        self.rules
            .iter()
            .filter(|r| {
                r.module_name.as_deref().map_or(true, |m| m == module_name || m == "*")
            })
            .collect()
    }

    pub fn get_stats(&self) -> PolicyStats {
        self.stats.read().clone()
    }

    pub fn clear_cache(&self) {
        self.cache.write().clear();
        info!("Policy engine cache cleared");
    }

    pub fn get_rules(&self) -> &[PolicyRule] {
        &self.rules
    }
}

pub fn create_default_policy_engine() -> PolicyEngine {
    let mut engine = PolicyEngine::new();

    engine.add_rule(PolicyRule {
        id: "allow-random-capability".into(),
        description: "Allow random number generation capability".into(),
        module_name: Some("*".into()),
        action: PolicyAction::CapabilityUse(Capability::Random),
        effect: Effect::Allow,
        priority: 80,
        conditions: vec![],
    });

    engine.add_rule(PolicyRule {
        id: "allow-clock-capability".into(),
        description: "Allow clock access capability".into(),
        module_name: Some("*".into()),
        action: PolicyAction::CapabilityUse(Capability::Clock),
        effect: Effect::Allow,
        priority: 80,
        conditions: vec![],
    });

    engine.add_rule(PolicyRule {
        id: "allow-kv-capability".into(),
        description: "Allow key-value store access for did-resolve".into(),
        module_name: Some("did-resolve".into()),
        action: PolicyAction::CapabilityUse(Capability::KeyValue),
        effect: Effect::Allow,
        priority: 80,
        conditions: vec![],
    });

    engine.add_rule(PolicyRule {
        id: "deny-credential-verify-network".into(),
        description: "Deny all network access for credential-verify module".into(),
        module_name: Some("credential-verify".into()),
        action: PolicyAction::NetworkAccess("*".into()),
        effect: Effect::Deny,
        priority: 100,
        conditions: vec![],
    });

    engine
}

pub fn sandbox_config_from_policy(module_name: &str, engine: &PolicyEngine) -> SandboxConfig {
    let mut config = SandboxConfig::restricted();
    let rules = engine.get_applicable_rules(module_name);

    for rule in rules {
        if let PolicyAction::CapabilityUse(ref cap) = rule.action {
            if rule.effect == Effect::Allow {
                config.add_capability(cap.clone());
            }
        }
    }

    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_deny() {
        let engine = PolicyEngine::new();
        let result = engine.evaluate_instantiate("unknown-module");
        assert!(result.is_err());
    }

    #[test]
    fn test_allow_known_module() {
        let engine = PolicyEngine::new();
        let result = engine.evaluate_instantiate("credential-verify").unwrap();
        assert_eq!(result.effect, Effect::Allow);
    }

    #[test]
    fn test_policy_statistics() {
        let engine = PolicyEngine::new();
        let _ = engine.evaluate_instantiate("credential-verify");
        let _ = engine.evaluate_instantiate("unknown-module");
        let stats = engine.get_stats();
        assert_eq!(stats.total_evaluations, 2);
    }

    #[test]
    fn test_condition_evaluation() {
        let mut context = HashMap::new();
        context.insert("path".into(), "/etc/passwd".into());

        let conditions = vec![PolicyCondition {
            attribute: "path".into(),
            operator: ConditionOperator::Matches,
            value: r"^(?!/tmp/).*".into(),
        }];

        let engine = PolicyEngine::new();
        assert!(engine.evaluate_conditions(&conditions, &context));

        context.insert("path".into(), "/tmp/test".into());
        assert!(!engine.evaluate_conditions(&conditions, &context));
    }

    #[test]
    fn test_sandbox_config_from_policy() {
        let engine = create_default_policy_engine();
        let config = sandbox_config_from_policy("credential-verify", &engine);
        assert!(config.has_capability(&Capability::Random));
        assert!(config.has_capability(&Capability::Clock));
        assert!(!config.has_capability(&Capability::Network));
    }

    #[test]
    fn test_cache_hit() {
        let engine = PolicyEngine::new();
        let result1 = engine.evaluate_instantiate("credential-verify").unwrap();
        let result2 = engine.evaluate_instantiate("credential-verify").unwrap();
        assert_eq!(result1.effect, result2.effect);
    }

    #[test]
    fn test_rule_priority_ordering() {
        let mut engine = PolicyEngine::new();
        engine.add_rule(PolicyRule {
            id: "high-priority-deny".into(),
            description: "High priority deny".into(),
            module_name: Some("*".into()),
            action: PolicyAction::Custom("*".into()),
            effect: Effect::Deny,
            priority: 999,
            conditions: vec![],
        });
        let result = engine.evaluate_instantiate("credential-verify").unwrap();
        assert_eq!(result.effect, Effect::Deny);
        assert_eq!(result.rule_id, "high-priority-deny");
    }
}
