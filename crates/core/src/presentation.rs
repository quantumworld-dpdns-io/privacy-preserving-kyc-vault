use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationRequest {
    pub id: String,
    pub query: Vec<PresentationQuery>,
    pub domain: Option<String>,
    pub challenge: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresentationQuery {
    #[serde(rename = "type")]
    pub query_type: String,
    pub credential_query: Vec<CredentialQuery>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialQuery {
    pub reason: Option<String>,
    pub required: bool,
    pub credential_type: Vec<String>,
    pub trusted_issuers: Option<Vec<String>>,
    pub fields: Option<Vec<String>>,
}

impl PresentationRequest {
    pub fn new(id: String) -> Self {
        Self {
            id,
            query: Vec::new(),
            domain: None,
            challenge: None,
        }
    }

    pub fn add_query(&mut self, credential_type: Vec<String>, required: bool) {
        let query = PresentationQuery {
            query_type: "QueryByExample".into(),
            credential_query: vec![CredentialQuery {
                reason: None,
                required,
                credential_type,
                trusted_issuers: None,
                fields: None,
            }],
        };
        self.query.push(query);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_presentation_request() {
        let mut req = PresentationRequest::new("urn:uuid:req-1".into());
        req.add_query(vec!["AgeVerificationCredential".into()], true);
        assert_eq!(req.query.len(), 1);
    }
}
