use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Service {
    pub id: String,
    #[serde(rename = "type")]
    pub service_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoints: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Service {
    pub fn new(id: String, service_type: String, endpoint: String) -> Self {
        Self {
            id,
            service_type,
            service_endpoint: Some(endpoint),
            endpoints: None,
            extra: std::collections::HashMap::new(),
        }
    }

    pub fn add_endpoint(&mut self, endpoint: String) {
        match &mut self.endpoints {
            Some(endpoints) => endpoints.push(endpoint),
            None => self.endpoints = Some(vec![endpoint]),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_creation() {
        let svc = Service::new(
            "did:example:123#api".into(),
            "KYCVerificationService".into(),
            "https://kyc.example.com/api".into(),
        );
        assert_eq!(svc.service_type, "KYCVerificationService");
        assert_eq!(svc.service_endpoint.unwrap(), "https://kyc.example.com/api");
    }

    #[test]
    fn test_service_multiple_endpoints() {
        let mut svc = Service::new(
            "did:example:123#hub".into(),
            "DIDCommHub".into(),
            "https://hub1.example.com".into(),
        );
        svc.add_endpoint("https://hub2.example.com".into());
        assert_eq!(svc.endpoints.unwrap().len(), 2);
    }
}
