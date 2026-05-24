use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityAttribute {
    pub name: String,
    pub value: serde_json::Value,
    pub namespace: String,
    pub source: String,
    pub verified: bool,
    pub proof: Option<String>,
    pub issued_at: String,
    pub expires_at: Option<String>,
    pub sensitivity: AttributeSensitivity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttributeSensitivity {
    Public,
    Internal,
    Sensitive,
    Confidential,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributeDerivation {
    pub source_attribute: String,
    pub derived_attribute: String,
    pub transformation: String,
    pub parameters: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributeStore {
    pub attributes: HashMap<String, IdentityAttribute>,
    pub derivations: Vec<AttributeDerivation>,
}

impl AttributeStore {
    pub fn new() -> Self {
        Self {
            attributes: HashMap::new(),
            derivations: Vec::new(),
        }
    }

    pub fn add_attribute(&mut self, attr: IdentityAttribute) {
        let key = format!("{}:{}", attr.namespace, attr.name);
        self.attributes.insert(key, attr);
    }

    pub fn get_attribute(&self, namespace: &str, name: &str) -> Option<&IdentityAttribute> {
        self.attributes.get(&format!("{}:{}", namespace, name))
    }

    pub fn get_attributes_by_namespace(&self, namespace: &str) -> Vec<&IdentityAttribute> {
        self.attributes
            .iter()
            .filter(|(k, _)| k.starts_with(&format!("{}:", namespace)))
            .map(|(_, v)| v)
            .collect()
    }

    pub fn derive_attribute(
        &mut self,
        source_ns: &str,
        source_name: &str,
        derived_ns: &str,
        derived_name: &str,
        transformation: &str,
        params: HashMap<String, serde_json::Value>,
    ) -> Option<IdentityAttribute> {
        let source = self.get_attribute(source_ns, source_name)?;

        let derived_value = match transformation {
            "over_age" => {
                let age = source.value.as_u64()?;
                serde_json::json!(age >= params.get("threshold").and_then(|v| v.as_u64()).unwrap_or(18))
            }
            "in_country_set" => {
                let country = source.value.as_str()?;
                let allowed = params
                    .get("countries")
                    .and_then(|v| v.as_array())
                    .map(|a| a.iter().filter_map(|v| v.as_str()).collect::<HashSet<_>>())
                    .unwrap_or_default();
                serde_json::json!(allowed.contains(country))
            }
            "range_check" => {
                let val = source.value.as_f64()?;
                let min = params.get("min").and_then(|v| v.as_f64()).unwrap_or(f64::MIN);
                let max = params.get("max").and_then(|v| v.as_f64()).unwrap_or(f64::MAX);
                serde_json::json!(val >= min && val <= max)
            }
            "hash" => {
                let data = source.value.to_string();
                serde_json::json!(blake3::hash(data.as_bytes()).to_hex().to_string())
            }
            "select_fields" => {
                let fields = params
                    .get("fields")
                    .and_then(|v| v.as_array())
                    .map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>())
                    .unwrap_or_default();
                let obj = source.value.as_object()?;
                let selected: HashMap<&str, &serde_json::Value> = fields
                    .iter()
                    .filter_map(|f| Some((*f, obj.get(*f)?)))
                    .collect();
                serde_json::json!(selected)
            }
            _ => return None,
        };

        let derived = IdentityAttribute {
            name: derived_name.to_string(),
            value: derived_value,
            namespace: derived_ns.to_string(),
            source: format!("{}:{}:{}", source_ns, source_name, transformation),
            verified: source.verified,
            proof: source.proof.clone(),
            issued_at: chrono::Utc::now().to_rfc3339(),
            expires_at: source.expires_at.clone(),
            sensitivity: source.sensitivity.clone(),
        };

        let derivation = AttributeDerivation {
            source_attribute: format!("{}:{}", source_ns, source_name),
            derived_attribute: format!("{}:{}", derived_ns, derived_name),
            transformation: transformation.to_string(),
            parameters: params,
        };

        let key = format!("{}:{}", derived_ns, derived_name);
        self.attributes.insert(key.clone(), derived);
        self.derivations.push(derivation);

        self.attributes.get(&key).cloned()
    }

    pub fn get_derivation_chain(&self, namespace: &str, name: &str) -> Vec<&AttributeDerivation> {
        let target = format!("{}:{}", namespace, name);
        self.derivations
            .iter()
            .filter(|d| d.derived_attribute == target)
            .collect()
    }
}

impl Default for AttributeStore {
    fn default() -> Self {
        Self::new()
    }
}
