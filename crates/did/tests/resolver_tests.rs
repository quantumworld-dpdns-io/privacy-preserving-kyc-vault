use kyc_vault_did::document::DIDDocument;
use kyc_vault_did::error::DIDError;
use kyc_vault_did::methods::{self, DIDMethod};
use kyc_vault_did::resolver::DIDResolver;
use kyc_vault_did::service::Service;
use kyc_vault_did::verification::{VerificationMethod, VerificationType};

#[tokio::test]
async fn test_resolve_did_key_method() {
    let resolver = DIDResolver::new();
    let doc = resolver.resolve("did:key:z6MkfQphJrtc6a8").await;
    assert!(doc.is_ok());
    let doc = doc.unwrap();
    assert!(doc.id.starts_with("did:key:"));
    assert!(doc.validate().is_ok());
    assert_eq!(doc.verification_method.len(), 1);
    assert_eq!(doc.authentication.len(), 1);
}

#[tokio::test]
async fn test_resolve_did_web_fails_without_network() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("did:web:nonexistent.example.com").await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_resolve_with_metadata() {
    let resolver = DIDResolver::new();
    let (doc, metadata) = resolver
        .resolve_with_metadata("did:key:z6MkfMetaTest")
        .await
        .unwrap();
    assert!(doc.id.contains("did:key:"));
    assert!(metadata.duration.as_micros() > 0);
    assert_eq!(metadata.resolver_type, "universal");
    assert!(metadata.resolved_at > 0);
}

#[tokio::test]
async fn test_cache_hit() {
    let resolver = DIDResolver::new();
    let doc1 = resolver.resolve("did:key:z6MkfCacheHit").await.unwrap();
    let doc2 = resolver.resolve("did:key:z6MkfCacheHit").await.unwrap();
    assert_eq!(doc1.id, doc2.id);
}

#[tokio::test]
async fn test_cache_invalidation() {
    let resolver = DIDResolver::new();
    resolver.resolve("did:key:z6MkfCacheInv").await.unwrap();
    resolver.invalidate_cache("did:key:z6MkfCacheInv").await;
    let doc = resolver.resolve("did:key:z6MkfCacheInv").await.unwrap();
    assert_eq!(doc.id, "did:key:z6MkfCacheInv");
}

#[tokio::test]
async fn test_unsupported_method_error() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("did:unsupported:abc123").await;
    assert!(result.is_err());
    match result.unwrap_err() {
        DIDError::UnsupportedMethod(m) => assert_eq!(m, "unsupported"),
        other => panic!("Expected UnsupportedMethod, got {:?}", other),
    }
}

#[tokio::test]
async fn test_invalid_did_format() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("not-a-did").await;
    assert!(result.is_err());
    match result.unwrap_err() {
        DIDError::InvalidDID(_) => {}
        other => panic!("Expected InvalidDID, got {:?}", other),
    }
}

#[tokio::test]
async fn test_empty_did_rejected() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("").await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_did_key_with_invalid_multibase() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("did:key:!!!invalid").await;
    assert!(result.is_err());
}

#[test]
fn test_parse_did_key_method() {
    let (method, msi) = methods::parse_did("did:key:z6MkfTest").unwrap();
    assert_eq!(method, DIDMethod::Key);
    assert_eq!(msi, "z6MkfTest");
}

#[test]
fn test_parse_did_web_method() {
    let (method, msi) = methods::parse_did("did:web:example.com:path:sub").unwrap();
    assert_eq!(method, DIDMethod::Web);
    assert_eq!(msi, "example.com:path:sub");
}

#[test]
fn test_parse_did_ethr_method() {
    let (method, msi) = methods::parse_did("did:ethr:0xabc123def456").unwrap();
    assert_eq!(method, DIDMethod::Ethr);
    assert_eq!(msi, "0xabc123def456");
}

#[test]
fn test_parse_did_with_chain_id() {
    let (method, msi) = methods::parse_did("did:ethr:5:0xabc").unwrap();
    assert_eq!(method, DIDMethod::Ethr);
    assert_eq!(msi, "5:0xabc");
}

#[test]
fn test_parse_invalid_did_no_scheme() {
    assert!(methods::parse_did("key:z6Mkf").is_err());
}

#[test]
fn test_parse_invalid_did_empty_msi() {
    assert!(methods::parse_did("did:key:").is_err());
    assert!(methods::parse_did("did::").is_err());
}

#[test]
fn test_did_document_validation_ok() {
    let doc = DIDDocument::new("did:example:valid");
    assert!(doc.validate().is_ok());
}

#[test]
fn test_did_document_validation_fails_bad_id() {
    let doc = DIDDocument::new("not-did");
    assert!(doc.validate().is_err());
}

#[test]
fn test_did_document_json_roundtrip() {
    let mut doc = DIDDocument::new("did:example:roundtrip");
    let svc = Service::new(
        "did:example:roundtrip#api".into(),
        "KYCService".into(),
        "https://api.example.com".into(),
    );
    doc.add_service(svc);

    let json = doc.to_json().unwrap();
    let restored = DIDDocument::from_json(&json).unwrap();
    assert_eq!(restored.id, doc.id);
    assert_eq!(restored.service.len(), 1);
}

#[test]
fn test_verification_method_ed25519() {
    let key = [0x01u8; 32];
    let vm = VerificationMethod::new_ed25519(
        "did:key:z6Mkf#z6Mkf".into(),
        "did:key:z6Mkf".into(),
        &key,
    );
    assert_eq!(vm.verification_type, VerificationType::Ed25519VerificationKey2020);
    assert!(vm.public_key_multibase.as_ref().unwrap().starts_with("z"));
}

#[test]
fn test_verification_method_secp256k1() {
    let key = [0x02u8; 33];
    let vm = VerificationMethod::new_secp256k1(
        "did:ethr:0xabc#key".into(),
        "did:ethr:0xabc".into(),
        &key,
    );
    assert_eq!(vm.verification_type, VerificationType::EcdsaSecp256k1VerificationKey2019);
}

#[test]
fn test_resolve_did_key_produces_valid_document() {
    let doc = methods::resolve_did_key("z6MkfTestABC").unwrap();
    assert_eq!(doc.verification_method.len(), 1);
    assert_eq!(doc.authentication.len(), 1);
    assert!(doc.validate().is_ok());
}

#[test]
fn test_service_creation_and_endpoints() {
    let mut svc = Service::new(
        "did:example:123#hub".into(),
        "DIDCommHub".into(),
        "https://hub1.example.com".into(),
    );
    svc.add_endpoint("https://hub2.example.com".into());
    assert_eq!(svc.service_type, "DIDCommHub");
    assert!(svc.endpoints.as_ref().unwrap().len() >= 2);
}

#[test]
fn test_did_document_with_multiple_services() {
    let mut doc = DIDDocument::new("did:example:multi-svc");
    doc.add_service(Service::new(
        "did:example:multi-svc#kyc".into(),
        "KYCService".into(),
        "https://kyc.example.com".into(),
    ));
    doc.add_service(Service::new(
        "did:example:multi-svc#didcomm".into(),
        "DIDComm".into(),
        "https://didcomm.example.com".into(),
    ));
    assert_eq!(doc.service.len(), 2);
}

#[tokio::test]
async fn test_custom_method_registration() {
    let mut resolver = DIDResolver::new();
    resolver.register_method(
        DIDMethod::Other("custom".to_string()),
        std::sync::Arc::new(|msi| {
            Ok(DIDDocument::new(format!("did:custom:{}", msi)))
        }),
    );

    let doc = resolver.resolve("did:custom:test123").await.unwrap();
    assert_eq!(doc.id, "did:custom:test123");
}
