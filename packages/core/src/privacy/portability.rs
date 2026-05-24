use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataExport {
    pub id: String,
    pub user_id: String,
    pub created_at: String,
    pub data_categories: Vec<String>,
    pub format: ExportFormat,
    pub data: HashMap<String, serde_json::Value>,
    pub metadata: ExportMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    Json,
    Csv,
    Cbor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportMetadata {
    pub export_version: String,
    pub exporter: String,
    pub record_count: u64,
    pub size_bytes: u64,
    pub compressed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortabilityEngine {
    pub exports: HashMap<String, DataExport>,
}

impl PortabilityEngine {
    pub fn new() -> Self {
        Self {
            exports: HashMap::new(),
        }
    }

    pub fn create_export(
        &mut self,
        user_id: String,
        data_categories: Vec<String>,
        data: HashMap<String, serde_json::Value>,
        format: ExportFormat,
    ) -> DataExport {
        let export = DataExport {
            id: format!("urn:export:{}", uuid::Uuid::new_v4()),
            user_id,
            created_at: chrono::Utc::now().to_rfc3339(),
            data_categories,
            format,
            data,
            metadata: ExportMetadata {
                export_version: "1.0".into(),
                exporter: "kyc-vault".into(),
                record_count: 0,
                size_bytes: 0,
                compressed: false,
            },
        };
        let id = export.id.clone();
        self.exports.insert(id, export.clone());
        export
    }

    pub fn export_as_json(&self, export: &DataExport) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&export.data)
    }

    pub fn export_as_csv(&self, export: &DataExport) -> Result<String, String> {
        let mut csv = String::new();
        let mut headers_written = false;

        for (category, value) in &export.data {
            if let serde_json::Value::Array(items) = value {
                for item in items {
                    if let serde_json::Value::Object(record) = item {
                        if !headers_written {
                            let headers: Vec<&String> = record.keys().collect();
                            csv.push_str(&headers.join(","));
                            csv.push('\n');
                            headers_written = true;
                        }
                        let values: Vec<String> = record
                            .values()
                            .map(|v| match v {
                                serde_json::Value::String(s) => {
                                    if s.contains(',') || s.contains('"') {
                                        format!("\"{}\"", s.replace('"', "\"\""))
                                    } else {
                                        s.clone()
                                    }
                                }
                                other => other.to_string(),
                            })
                            .collect();
                        csv.push_str(&values.join(","));
                        csv.push('\n');
                    }
                }
            }
        }

        if !headers_written {
            return Err("No structured data to export as CSV".into());
        }

        Ok(csv)
    }

    pub fn export_as_cbor(&self, export: &DataExport) -> Result<Vec<u8>, String> {
        let json = serde_json::to_vec(&export.data).map_err(|e| e.to_string())?;
        Ok(json)
    }

    pub fn get_export(&self, export_id: &str) -> Option<&DataExport> {
        self.exports.get(export_id)
    }

    pub fn list_user_exports(&self, user_id: &str) -> Vec<&DataExport> {
        self.exports.values().filter(|e| e.user_id == user_id).collect()
    }

    pub fn delete_export(&mut self, export_id: &str) -> bool {
        self.exports.remove(export_id).is_some()
    }

    pub fn estimate_export_size(&self, data: &HashMap<String, serde_json::Value>) -> u64 {
        data.values()
            .map(|v| serde_json::to_string(v).map(|s| s.len() as u64).unwrap_or(0))
            .sum()
    }
}

impl Default for PortabilityEngine {
    fn default() -> Self {
        Self::new()
    }
}
