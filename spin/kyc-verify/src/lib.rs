use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use spin_sdk::http::{IntoResponse, Json, Params, Request, Response, Router};
use spin_sdk::key_value::Store;
use spin_sdk::sqlite::Connection;

#[derive(Debug, Deserialize)]
struct VerifyRequest {
    credential_id: String,
    credential_data: String,
    proof: String,
    issuer_did: Option<String>,
}

#[derive(Debug, Serialize)]
struct VerifyResponse {
    verified: bool,
    credential_id: String,
    checks: Vec<CheckResult>,
    timestamp: String,
}

#[derive(Debug, Serialize)]
struct CheckResult {
    name: String,
    passed: bool,
    detail: String,
}

#[derive(Debug, Deserialize)]
struct CredentialRecord {
    id: String,
    issuer: String,
    subject: String,
    hash: String,
    issued_at: String,
    revoked: bool,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
    code: String,
}

fn error_response(code: &str, msg: &str) -> Response {
    Response::builder()
        .status(400)
        .header("content-type", "application/json")
        .body(
            serde_json::to_vec(&ErrorResponse {
                error: msg.to_string(),
                code: code.to_string(),
            })
            .unwrap(),
        )
        .build()
}

#[derive(Debug, Deserialize)]
struct HashVerification {
    credential_hash: String,
    expected_hash: String,
}

fn verify_hash(data: &str, expected: &str) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    let actual = hex::encode(hasher.finalize());
    actual == expected
}

fn verify_ed25519(data: &[u8], signature_hex: &str, pubkey_hex: &str) -> Result<bool> {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    let pubkey_bytes = hex::decode(pubkey_hex)
        .map_err(|e| anyhow!("invalid pubkey hex: {}", e))?;
    let sig_bytes = hex::decode(signature_hex)
        .map_err(|e| anyhow!("invalid signature hex: {}", e))?;

    let verifying_key = VerifyingKey::from_bytes(
        pubkey_bytes
            .try_into()
            .map_err(|_| anyhow!("pubkey length != 32"))?,
    )
    .map_err(|e| anyhow!("invalid ed25519 pubkey: {}", e))?;

    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|e| anyhow!("invalid signature: {}", e))?;

    Ok(verifying_key.verify(data, &signature).is_ok())
}

fn check_credential_status(credential_id: &str) -> Result<bool> {
    let store = Store::open("default")?;
    let revoked_key = format!("credential:revoked:{}", credential_id);

    match store.get(&revoked_key) {
        Ok(data) => {
            if data == b"true" {
                return Ok(false);
            }
            Ok(true)
        }
        Err(_) => Ok(true),
    }
}

fn validate_schema(credential_data: &serde_json::Value) -> Result<Vec<CheckResult>> {
    let mut checks = Vec::new();

    let has_context = credential_data
        .get("@context")
        .and_then(|c| c.as_array())
        .is_some();
    checks.push(CheckResult {
        name: "context_exists".into(),
        passed: has_context,
        detail: if has_context {
            "credential has @context".into()
        } else {
            "missing @context field".into()
        },
    });

    let has_type = credential_data
        .get("type")
        .and_then(|t| t.as_array())
        .is_some();
    checks.push(CheckResult {
        name: "type_exists".into(),
        passed: has_type,
        detail: if has_type {
            "credential has type array".into()
        } else {
            "missing type field".into()
        },
    });

    let has_issuer = credential_data.get("issuer").is_some();
    checks.push(CheckResult {
        name: "issuer_exists".into(),
        passed: has_issuer,
        detail: if has_issuer {
            "credential has issuer".into()
        } else {
            "missing issuer field".into()
        },
    });

    let has_subject = credential_data
        .get("credentialSubject")
        .and_then(|s| s.get("id"))
        .is_some();
    checks.push(CheckResult {
        name: "subject_exists".into(),
        passed: has_subject,
        detail: if has_subject {
            "credential has subject id".into()
        } else {
            "missing credentialSubject.id".into()
        },
    });

    Ok(checks)
}

async fn handle_verify(req: Request, _params: Params) -> impl IntoResponse {
    let body: VerifyRequest = match req.json() {
        Ok(b) => b,
        Err(e) => return error_response("invalid_request", &format!("invalid json: {}", e)),
    };

    let mut checks = Vec::new();

    let hash_check = verify_hash(&body.credential_data, &body.credential_data);
    checks.push(CheckResult {
        name: "hash_integrity".into(),
        passed: hash_check,
        detail: "credential data hash verified".into(),
    });

    let credential_json: serde_json::Value = match serde_json::from_str(&body.credential_data) {
        Ok(v) => v,
        Err(e) => {
            return error_response(
                "parse_error",
                &format!("invalid credential json: {}", e),
            )
        }
    };
    let mut schema_checks = validate_schema(&credential_json)?;
    checks.append(&mut schema_checks);

    let status_ok = match check_credential_status(&body.credential_id) {
        Ok(true) => true,
        Ok(false) => {
            checks.push(CheckResult {
                name: "credential_status".into(),
                passed: false,
                detail: "credential has been revoked".into(),
            });
            false
        }
        Err(e) => {
            checks.push(CheckResult {
                name: "credential_status".into(),
                passed: false,
                detail: format!("status check failed: {}", e),
            });
            false
        }
    };

    if status_ok {
        checks.push(CheckResult {
            name: "credential_status".into(),
            passed: true,
            detail: "credential is active".into(),
        });
    }

    let all_passed = checks.iter().all(|c| c.passed);

    if let Some(issuer_did) = &body.issuer_did {
        if let Some(proof_field) = credential_json.get("proof") {
            if let (Some(sig), Some(pubkey)) = (
                proof_field.get("jws").and_then(|j| j.as_str()),
                proof_field.get("verificationMethod").and_then(|v| v.as_str()),
            ) {
                match verify_ed25519(body.credential_data.as_bytes(), sig, pubkey) {
                    Ok(true) => {
                        checks.push(CheckResult {
                            name: "proof_verification".into(),
                            passed: true,
                            detail: format!("ed25519 signature verified against {}", issuer_did),
                        });
                    }
                    Ok(false) => {
                        checks.push(CheckResult {
                            name: "proof_verification".into(),
                            passed: false,
                            detail: "ed25519 signature does not match".into(),
                        });
                    }
                    Err(e) => {
                        checks.push(CheckResult {
                            name: "proof_verification".into(),
                            passed: false,
                            detail: format!("proof verification error: {}", e),
                        });
                    }
                }
            }
        }
    }

    let response = VerifyResponse {
        verified: all_passed,
        credential_id: body.credential_id,
        checks,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };

    Response::builder()
        .status(if all_passed { 200 } else { 400 })
        .header("content-type", "application/json")
        .body(serde_json::to_vec(&response).unwrap())
        .build()
}

async fn handle_lookup(req: Request, params: Params) -> impl IntoResponse {
    let credential_id = match params.get("id") {
        Some(id) => id,
        None => return error_response("missing_id", "credential id is required"),
    };

    let store = match Store::open("default") {
        Ok(s) => s,
        Err(e) => {
            return Response::builder()
                .status(500)
                .header("content-type", "application/json")
                .body(
                    serde_json::to_vec(&ErrorResponse {
                        error: format!("storage error: {}", e),
                        code: "storage_error".into(),
                    })
                    .unwrap(),
                )
                .build()
        }
    };

    let key = format!("credential:{}", credential_id);
    match store.get(&key) {
        Ok(data) => {
            let record: CredentialRecord = match serde_json::from_slice(&data) {
                Ok(r) => r,
                Err(e) => {
                    return error_response("parse_error", &format!("invalid record: {}", e))
                }
            };

            Response::builder()
                .status(200)
                .header("content-type", "application/json")
                .body(serde_json::to_vec(&record).unwrap())
                .build()
        }
        Err(_) => error_response("not_found", "credential not found"),
    }
}

#[spin_sdk::http_component]
async fn kyc_verify(req: Request) -> Response {
    let mut router = Router::new();
    router.post("/api/v1/credential/verify", handle_verify);
    router.get("/api/v1/credential/:id", handle_lookup);
    router.any("/api/v1/credential/health", |_req, _params| async move {
        Response::builder()
            .status(200)
            .header("content-type", "application/json")
            .body(serde_json::json!({"status": "ok", "service": "kyc-verify"}).to_string())
            .build()
    });

    router.handle(req).await
}
