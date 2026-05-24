use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialSchema {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub attributes: Vec<SchemaAttribute>,
    pub required: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaAttribute {
    pub name: String,
    pub attribute_type: AttributeType,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub constraints: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sensitivity: Option<SensitivityLevel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AttributeType {
    String,
    Number,
    Boolean,
    Date,
    DateTime,
    Image,
    Document,
    Address,
    Enum(Vec<String>),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SensitivityLevel {
    Public,
    Low,
    Medium,
    High,
    Critical,
}

pub struct SchemaRegistry {
    schemas: HashMap<String, CredentialSchema>,
}

impl SchemaRegistry {
    pub fn new() -> Self {
        Self {
            schemas: HashMap::new(),
        }
    }

    pub fn register(&mut self, schema: CredentialSchema) {
        self.schemas.insert(schema.id.clone(), schema);
    }

    pub fn get(&self, id: &str) -> Option<&CredentialSchema> {
        self.schemas.get(id)
    }

    pub fn validate(&self, schema_id: &str, data: &HashMap<String, serde_json::Value>) -> Result<(), String> {
        let schema = self
            .schemas
            .get(schema_id)
            .ok_or_else(|| format!("Schema not found: {}", schema_id))?;

        for required in &schema.required {
            if !data.contains_key(required) {
                return Err(format!("Missing required attribute: {}", required));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_registration() {
        let schema = CredentialSchema {
            id: "kyc-age-verification-v1".into(),
            name: "Age Verification".into(),
            version: "1.0.0".into(),
            author: "did:example:authority".into(),
            attributes: vec![
                SchemaAttribute {
                    name: "age".into(),
                    attribute_type: AttributeType::Number,
                    description: "Verified age".into(),
                    constraints: Some(vec!["min:18".into(), "max:150".into()]),
                    sensitivity: Some(SensitivityLevel::High),
                },
            ],
            required: vec!["age".into()],
        };

        let mut registry = SchemaRegistry::new();
        registry.register(schema);
        assert!(registry.get("kyc-age-verification-v1").is_some());
    }

    #[test]
    fn test_schema_validation() {
        let schema = CredentialSchema {
            id: "test-schema".into(),
            name: "Test".into(),
            version: "1.0.0".into(),
            author: "did:example:auth".into(),
            attributes: vec![
                SchemaAttribute {
                    name: "name".into(),
                    attribute_type: AttributeType::String,
                    description: "Full name".into(),
                    constraints: None,
                    sensitivity: Some(SensitivityLevel::Medium),
                },
            ],
            required: vec!["name".into()],
        };

        let mut registry = SchemaRegistry::new();
        registry.register(schema);

        let mut valid_data = HashMap::new();
        valid_data.insert("name".into(), serde_json::json!("Alice"));
        assert!(registry.validate("test-schema", &valid_data).is_ok());

        let empty_data = HashMap::new();
        assert!(registry.validate("test-schema", &empty_data).is_err());
    }
}
