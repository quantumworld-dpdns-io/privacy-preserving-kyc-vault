use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use spin_sdk::http::{IntoResponse, Json, Params, Request, Response, Router};
use spin_sdk::key_value::Store;
use std::collections::HashMap;

#[derive(Debug, Serialize)]
struct DIDDocument {
    #[serde(rename = "@context")]
    context: Vec<String>,
    id: String,
    #[serde(rename = "verificationMethod", skip_serializing_if = "Option::is_none")]
    verification_method: Option<Vec<VerificationMethod>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    authentication: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    service: Option<Vec<Service>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VerificationMethod {
    id: String,
    #[serde(rename = "type")]
    method_type: String,
    controller: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    public_key_multibase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    public_key_jwk: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Service {
    id: String,
    #[serde(rename = "type")]
    service_type: String,
    service_endpoint: String,
}

#[derive(Debug, Serialize)]
struct ResolveResponse {
    did: String,
    document: DIDDocument,
    method: String,
    method_specific_id: String,
    resolved_at: String,
    cache_hit: bool,
}

#[derive(Debug, Serialize)]
struct ResolveError {
    did: String,
    error: String,
    code: String,
}

#[derive(Debug, Deserialize)]
struct ResolveRequest {
    did: String,
    options: Option<ResolveOptions>,
}

#[derive(Debug, Deserialize, Default)]
struct ResolveOptions {
    accept: Option<String>,
    no_cache: Option<bool>,
}

fn error_response(did: &str, code: &str, msg: &str) -> Response {
    Response::builder()
        .status(400)
        .header("content-type", "application/json")
        .body(
            serde_json::to_vec(&ResolveError {
                did: did.to_string(),
                error: msg.to_string(),
                code: code.to_string(),
            })
            .unwrap(),
        )
        .build()
}

fn parse_did_method(did: &str) -> Result<(&str, &str)> {
    let parts: Vec<&str> = did.splitn(3, ':').collect();
    if parts.len() < 3 || parts[0] != "did" {
        return Err(anyhow!("invalid did format: must start with 'did:'"));
    }
    Ok((parts[1], parts[2]))
}

fn create_did_key_document(did: &str, method_specific_id: &str) -> DIDDocument {
    let vm_id = format!("{}#{}", did, method_specific_id);

    DIDDocument {
        context: vec![
            "https://www.w3.org/ns/did/v1".into(),
            "https://w3id.org/security/multikey/v1".into(),
        ],
        id: did.to_string(),
        verification_method: Some(vec![VerificationMethod {
            id: vm_id.clone(),
            method_type: "Multikey".into(),
            controller: did.to_string(),
            public_key_multibase: Some(method_specific_id.to_string()),
            public_key_jwk: None,
        }]),
        authentication: Some(vec![vm_id]),
        service: None,
        created: Some(chrono::Utc::now().to_rfc3339()),
        updated: None,
    }
}

fn create_did_web_document(did: &str, domain: &str) -> DIDDocument {
    DIDDocument {
        context: vec![
            "https://www.w3.org/ns/did/v1".into(),
        ],
        id: did.to_string(),
        verification_method: None,
        authentication: None,
        service: Some(vec![Service {
            id: format!("{}#web", did),
            service_type: "LinkedDomains".into(),
            service_endpoint: format!("https://{}", domain),
        }]),
        created: Some(chrono::Utc::now().to_rfc3339()),
        updated: None,
    }
}

fn create_did_ethr_document(did: &str, address: &str) -> DIDDocument {
    let full_address = if address.starts_with("0x") {
        address.to_string()
    } else {
        format!("0x{}", address)
    };
    let vm_id = format!("{}#controller", did);

    DIDDocument {
        context: vec![
            "https://www.w3.org/ns/did/v1".into(),
            "https://w3id.org/security/suites/secp256k1recovery-2020/v2".into(),
        ],
        id: did.to_string(),
        verification_method: Some(vec![VerificationMethod {
            id: vm_id.clone(),
            method_type: "EcdsaSecp256k1RecoveryMethod2020".into(),
            controller: did.to_string(),
            public_key_multibase: None,
            public_key_jwk: Some(HashMap::from([(
                "ethereumAddress".into(),
                full_address,
            )])),
        }]),
        authentication: Some(vec![vm_id]),
        service: None,
        created: None,
        updated: None,
    }
}

async fn resolve_did_web_remote(did: &str, domain: &str) -> Result<DIDDocument> {
    let url = format!("https://{}/.well-known/did.json", domain);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| anyhow!("client build: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| anyhow!("http request: {}", e))?;

    if !resp.status().is_success() {
        return Err(anyhow!("did:web not found at {}", url));
    }

    let doc: DIDDocument = resp
        .json()
        .await
        .map_err(|e| anyhow!("json parse: {}", e))?;

    Ok(doc)
}

async fn handle_resolve(req: Request, _params: Params) -> impl IntoResponse {
    let body: ResolveRequest = match req.json() {
        Ok(b) => b,
        Err(e) => {
            return Response::builder()
                .status(400)
                .header("content-type", "application/json")
                .body(
                    serde_json::to_vec(&ResolveError {
                        did: "unknown".into(),
                        error: format!("invalid request body: {}", e),
                        code: "invalid_request".into(),
                    })
                    .unwrap(),
                )
                .build()
        }
    };

    let (method, method_specific_id) = match parse_did_method(&body.did) {
        Ok(m) => m,
        Err(e) => return error_response(&body.did, "invalid_did", &e.to_string()),
    };

    let no_cache = body.options.as_ref().and_then(|o| o.no_cache).unwrap_or(false);

    if !no_cache {
        if let Ok(store) = Store::open("default") {
            let cache_key = format!("did:resolve:{}", &body.did);
            if let Ok(data) = store.get(&cache_key) {
                if let Ok(doc) = serde_json::from_slice::<DIDDocument>(&data) {
                    let resp = ResolveResponse {
                        did: body.did.clone(),
                        document: doc,
                        method: method.to_string(),
                        method_specific_id: method_specific_id.to_string(),
                        resolved_at: chrono::Utc::now().to_rfc3339(),
                        cache_hit: true,
                    };
                    return Response::builder()
                        .status(200)
                        .header("content-type", "application/json")
                        .header("x-cache", "hit")
                        .body(serde_json::to_vec(&resp).unwrap())
                        .build();
                }
            }
        }
    }

    let document = match method {
        "key" => Ok(create_did_key_document(&body.did, method_specific_id)),
        "web" => {
            match resolve_did_web_remote(&body.did, method_specific_id).await {
                Ok(doc) => Ok(doc),
                Err(_) => Ok(create_did_web_document(&body.did, method_specific_id)),
            }
        }
        "ethr" => Ok(create_did_ethr_document(&body.did, method_specific_id)),
        unsupported => {
            return error_response(
                &body.did,
                "unsupported_method",
                &format!("did method '{}' is not supported", unsupported),
            )
        }
    };

    match document {
        Ok(doc) => {
            if let Ok(store) = Store::open("default") {
                let cache_key = format!("did:resolve:{}", &body.did);
                if let Ok(data) = serde_json::to_vec(&doc) {
                    let _ = store.set(&cache_key, &data);
                }
            }

            let resp = ResolveResponse {
                did: body.did.clone(),
                document: doc,
                method: method.to_string(),
                method_specific_id: method_specific_id.to_string(),
                resolved_at: chrono::Utc::now().to_rfc3339(),
                cache_hit: false,
            };

            Response::builder()
                .status(200)
                .header("content-type", "application/json")
                .header("x-cache", "miss")
                .body(serde_json::to_vec(&resp).unwrap())
                .build()
        }
        Err(e) => error_response(&body.did, "resolve_error", &e.to_string()),
    }
}

async fn handle_bulk_resolve(req: Request, _params: Params) -> impl IntoResponse {
    let dids: Vec<String> = match req.json() {
        Ok(d) => d,
        Err(e) => {
            return Response::builder()
                .status(400)
                .header("content-type", "application/json")
                .body(
                    serde_json::json!({
                        "error": format!("invalid request: {}", e),
                        "code": "invalid_request"
                    })
                    .to_string(),
                )
                .build()
        }
    };

    let mut results = Vec::new();
    for did in dids {
        let (method, msi) = parse_did_method(&did).unwrap_or(("unknown", ""));
        let doc = match method {
            "key" => create_did_key_document(&did, msi),
            "web" => create_did_web_document(&did, msi),
            "ethr" => create_did_ethr_document(&did, msi),
            _ => {
                results.push(serde_json::json!({
                    "did": did,
                    "error": "unsupported method",
                    "code": "unsupported_method"
                }));
                continue;
            }
        };

        results.push(serde_json::json!({
            "did": did,
            "document": doc,
            "method": method,
            "resolved_at": chrono::Utc::now().to_rfc3339()
        }));
    }

    Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(serde_json::to_vec(&results).unwrap())
        .build()
}

async fn handle_health(_req: Request, _params: Params) -> impl IntoResponse {
    Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(
            serde_json::json!({
                "status": "ok",
                "service": "did-resolve",
                "methods": ["key", "web", "ethr"]
            })
            .to_string(),
        )
        .build()
}

#[spin_sdk::http_component]
async fn did_resolve(req: Request) -> Response {
    let mut router = Router::new();
    router.post("/api/v1/did/resolve", handle_resolve);
    router.post("/api/v1/did/resolve/bulk", handle_bulk_resolve);
    router.get("/api/v1/did/resolve/health", handle_health);
    router.any("/api/v1/did/health", handle_health);

    router.handle(req).await
}
