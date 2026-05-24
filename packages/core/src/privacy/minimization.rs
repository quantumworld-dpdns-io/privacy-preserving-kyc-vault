use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataField {
    pub name: String,
    pub path: String,
    pub required: bool,
    pub sensitivity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinimizationPolicy {
    pub id: String,
    pub name: String,
    pub allowed_fields: Vec<String>,
    pub excluded_fields: Vec<String>,
    pub transformation_rules: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinimizationEngine {
    pub policies: HashMap<String, MinimizationPolicy>,
    pub field_registry: HashMap<String, DataField>,
}

impl MinimizationEngine {
    pub fn new() -> Self {
        Self {
            policies: HashMap::new(),
            field_registry: HashMap::new(),
        }
    }

    pub fn register_field(&mut self, field: DataField) {
        self.field_registry.insert(field.name.clone(), field);
    }

    pub fn register_policy(&mut self, policy: MinimizationPolicy) {
        self.policies.insert(policy.id.clone(), policy);
    }

    pub fn minimize(
        &self,
        data: serde_json::Value,
        policy_id: &str,
    ) -> Result<serde_json::Value, String> {
        let policy = self
            .policies
            .get(policy_id)
            .ok_or_else(|| format!("Policy not found: {}", policy_id))?;

        let allowed_set: HashSet<&str> = policy.allowed_fields.iter().map(|s| s.as_str()).collect();
        let excluded_set: HashSet<&str> = policy.excluded_fields.iter().map(|s| s.as_str()).collect();

        self.filter_object(&data, &allowed_set, &excluded_set, &policy.transformation_rules)
    }

    fn filter_object(
        &self,
        value: &serde_json::Value,
        allowed: &HashSet<&str>,
        excluded: &HashSet<&str>,
        transformations: &HashMap<String, String>,
    ) -> Result<serde_json::Value, String> {
        match value {
            serde_json::Value::Object(map) => {
                let mut result = serde_json::Map::new();
                for (key, val) in map {
                    if excluded.contains(key.as_str()) {
                        continue;
                    }
                    if !allowed.is_empty() && !allowed.contains(key.as_str()) {
                        continue;
                    }
                    if let Some(transform) = transformations.get(key.as_str()) {
                        let transformed = self.apply_transformation(val, transform)?;
                        result.insert(key.clone(), transformed);
                    } else {
                        let filtered = self.filter_object(val, allowed, excluded, transformations)?;
                        result.insert(key.clone(), filtered);
                    }
                }
                Ok(serde_json::Value::Object(result))
            }
            serde_json::Value::Array(arr) => {
                let filtered: Result<Vec<_>, _> = arr
                    .iter()
                    .map(|item| self.filter_object(item, allowed, excluded, transformations))
                    .collect();
                Ok(serde_json::Value::Array(filtered?))
            }
            other => Ok(other.clone()),
        }
    }

    fn apply_transformation(&self, value: &serde_json::Value, transform: &str) -> Result<serde_json::Value, String> {
        match transform {
            "hash" => {
                let data = value.to_string();
                Ok(serde_json::json!(blake3::hash(data.as_bytes()).to_hex().to_string()))
            }
            "mask" => {
                let s = value
                    .as_str()
                    .ok_or_else(|| "Expected string for masking".to_string())?;
                let masked = if s.len() <= 4 {
                    "*".repeat(s.len())
                } else {
                    format!("{}****{}", &s[..2], &s[s.len() - 2..])
                };
                Ok(serde_json::json!(masked))
            }
            "redact" => Ok(serde_json::Value::Null),
            "round" => {
                let n = value
                    .as_f64()
                    .ok_or_else(|| "Expected number for rounding".to_string())?;
                Ok(serde_json::json!((n * 10.0).round() / 10.0))
            }
            "truncate" => {
                let s = value
                    .as_str()
                    .ok_or_else(|| "Expected string for truncation".to_string())?;
                let max_len = 10;
                if s.len() > max_len {
                    Ok(serde_json::json!(format!("{}...", &s[..max_len])))
                } else {
                    Ok(value.clone())
                }
            }
            "bucket" => {
                let n = value
                    .as_f64()
                    .ok_or_else(|| "Expected number for bucketing".to_string())?;
                let bucket = ((n / 10.0).floor() * 10.0) as i64;
                let range = format!("{}-{}", bucket, bucket + 9);
                Ok(serde_json::json!(range))
            }
            _ => Ok(value.clone()),
        }
    }

    pub fn get_required_fields(&self, policy_id: &str) -> Result<Vec<String>, String> {
        let policy = self
            .policies
            .get(policy_id)
            .ok_or_else(|| format!("Policy not found: {}", policy_id))?;
        Ok(policy.allowed_fields.clone())
    }

    pub fn list_policies(&self) -> Vec<&MinimizationPolicy> {
        self.policies.values().collect()
    }
}

impl Default for MinimizationEngine {
    fn default() -> Self {
        Self::new()
    }
}
