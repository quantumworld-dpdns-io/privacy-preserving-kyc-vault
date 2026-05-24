use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AttributeSensitivity {
    Public,
    Internal,
    Sensitive,
    Confidential,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityAttribute {
    pub name: String,
    pub value: serde_json::Value,
    pub namespace: String,
    pub verified: bool,
    pub sensitivity: AttributeSensitivity,
    pub issued_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributeDefinition {
    pub name: String,
    pub description: String,
    pub namespace: String,
    pub value_type: String,
    pub required: bool,
    pub sensitivity: AttributeSensitivity,
    pub validation_rules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttributeManager {
    pub definitions: HashMap<String, AttributeDefinition>,
    pub attributes: HashMap<String, IdentityAttribute>,
}

impl AttributeManager {
    pub fn new() -> Self {
        Self {
            definitions: HashMap::new(),
            attributes: HashMap::new(),
        }
    }

    pub fn register_definition(&mut self, def: AttributeDefinition) {
        let key = format!("{}:{}", def.namespace, def.name);
        self.definitions.insert(key, def);
    }

    pub fn get_definition(&self, namespace: &str, name: &str) -> Option<&AttributeDefinition> {
        self.definitions.get(&format!("{}:{}", namespace, name))
    }

    pub fn set_attribute(&mut self, attr: IdentityAttribute) {
        let key = format!("{}:{}", attr.namespace, attr.name);
        self.attributes.insert(key, attr);
    }

    pub fn get_attribute(&self, namespace: &str, name: &str) -> Option<&IdentityAttribute> {
        self.attributes.get(&format!("{}:{}", namespace, name))
    }

    pub fn get_attributes_in_namespace(&self, namespace: &str) -> Vec<&IdentityAttribute> {
        self.attributes
            .iter()
            .filter(|(k, _)| k.starts_with(&format!("{}:", namespace)))
            .map(|(_, v)| v)
            .collect()
    }

    pub fn validate_attribute(&self, namespace: &str, name: &str, value: &serde_json::Value) -> Result<(), String> {
        let def = self
            .get_definition(namespace, name)
            .ok_or_else(|| format!("No definition for {}/{}", namespace, name))?;

        let type_ok = match def.value_type.as_str() {
            "string" => value.is_string(),
            "number" => value.is_number(),
            "boolean" => value.is_boolean(),
            "array" => value.is_array(),
            "object" => value.is_object(),
            _ => true,
        };
        if !type_ok {
            return Err(format!(
                "Expected type {} for {}/{}",
                def.value_type, namespace, name
            ));
        }

        Ok(())
    }

    pub fn remove_attribute(&mut self, namespace: &str, name: &str) -> bool {
        self.attributes.remove(&format!("{}:{}", namespace, name)).is_some()
    }

    pub fn list_definitions(&self) -> Vec<&AttributeDefinition> {
        self.definitions.values().collect()
    }
}

impl Default for AttributeManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_get_definition() {
        let mut mgr = AttributeManager::new();
        let def = AttributeDefinition {
            name: "age".into(),
            description: "User age".into(),
            namespace: "kyc".into(),
            value_type: "number".into(),
            required: true,
            sensitivity: AttributeSensitivity::Sensitive,
            validation_rules: vec![],
        };
        mgr.register_definition(def);

        let retrieved = mgr.get_definition("kyc", "age");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().value_type, "number");
    }

    #[test]
    fn test_set_and_get_attribute() {
        let mut mgr = AttributeManager::new();
        let attr = IdentityAttribute {
            name: "email".into(),
            value: serde_json::json!("user@example.com"),
            namespace: "contact".into(),
            verified: true,
            sensitivity: AttributeSensitivity::Internal,
            issued_at: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
        };
        mgr.set_attribute(attr);

        let retrieved = mgr.get_attribute("contact", "email");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().value, "user@example.com");
    }

    #[test]
    fn test_validate_attribute() {
        let mut mgr = AttributeManager::new();
        let def = AttributeDefinition {
            name: "age".into(),
            description: "User age".into(),
            namespace: "kyc".into(),
            value_type: "number".into(),
            required: true,
            sensitivity: AttributeSensitivity::Sensitive,
            validation_rules: vec![],
        };
        mgr.register_definition(def);

        assert!(mgr.validate_attribute("kyc", "age", &serde_json::json!(25)).is_ok());
        assert!(mgr.validate_attribute("kyc", "age", &serde_json::json!("25")).is_err());
    }

    #[test]
    fn test_remove_attribute() {
        let mut mgr = AttributeManager::new();
        let attr = IdentityAttribute {
            name: "temp".into(),
            value: serde_json::json!("value"),
            namespace: "test".into(),
            verified: false,
            sensitivity: AttributeSensitivity::Public,
            issued_at: chrono::Utc::now().to_rfc3339(),
            expires_at: None,
        };
        mgr.set_attribute(attr);
        assert!(mgr.remove_attribute("test", "temp"));
        assert!(mgr.get_attribute("test", "temp").is_none());
    }
}
