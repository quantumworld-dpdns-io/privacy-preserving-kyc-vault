use kyc_vault_did::document::DIDDocument;
use kyc_vault_did::error::DIDError;
use kyc_vault_did::methods::{self, DIDMethod};
use kyc_vault_did::resolver::DIDResolver;
use kyc_vault_did::verification::{VerificationMethod, VerificationType};

#[tokio::test]
async fn test_resolve_did_key_method() {
    let resolver = DIDResolver::new();
    let doc = resolver.resolve("did:key:z6MkfQphJrtc6a8eBSeH2jKGJsNzaP").await;
    assert!(doc.is_ok());
    let doc = doc.unwrap();
    assert!(doc.id.contains("did:key:"));
    assert!(doc.validate().is_ok());
}

#[tokio::test]
async fn test_resolve_with_metadata_returns_duration() {
    let resolver = DIDResolver::new();
    let result = resolver
        .resolve_with_metadata("did:key:z6MkfTestABC123")
        .await;
    assert!(result.is_ok());
    let (doc, metadata) = result.unwrap();
    assert!(doc.id.contains("did:key:"));
    assert!(metadata.duration.as_micros() > 0);
    assert_eq!(metadata.resolver_type, "universal");
}

#[tokio::test]
async fn test_cache_effectiveness() {
    let resolver = DIDResolver::new();
    let start = std::time::Instant::now();
    let _doc1 = resolver.resolve("did:key:z6MkfCacheTest").await.unwrap();
    let first_duration = start.elapsed();

    let start2 = std::time::Instant::now();
    let doc2 = resolver.resolve("did:key:z6MkfCacheTest").await.unwrap();
    let second_duration = start2.elapsed();

    assert_eq!(doc2.id, "did:key:z6MkfCacheTest");
    assert!(second_duration <= first_duration || second_duration.as_micros() < 1000);
}

#[tokio::test]
async fn test_cache_invalidation() {
    let resolver = DIDResolver::new();
    resolver.resolve("did:key:z6MkfInvalidate").await.unwrap();

    resolver.invalidate_cache("did:key:z6MkfInvalidate").await;
    let doc = resolver.resolve("did:key:z6MkfInvalidate").await.unwrap();
    assert_eq!(doc.id, "did:key:z6MkfInvalidate");
}

#[tokio::test]
async fn test_unsupported_method_returns_error() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("did:unsupported:abc123").await;
    assert!(result.is_err());
    match result.unwrap_err() {
        DIDError::UnsupportedMethod(method) => assert_eq!(method, "unsupported"),
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
async fn test_parse_various_did_methods() {
    let (method, msi) = methods::parse_did("did:key:z6Mkf").unwrap();
    assert_eq!(method, DIDMethod::Key);
    assert_eq!(msi, "z6Mkf");

    let (method, msi) = methods::parse_did("did:web:example.com:path").unwrap();
    assert_eq!(method, DIDMethod::Web);
    assert_eq!(msi, "example.com:path");

    let (method, msi) = methods::parse_did("did:ethr:0xabc").unwrap();
    assert_eq!(method, DIDMethod::Ethr);
    assert_eq!(msi, "0xabc");
}

#[test]
fn test_did_document_validation() {
    let doc = DIDDocument::new("did:example:valid");
    assert!(doc.validate().is_ok());

    let doc = DIDDocument::new("not-a-did");
    assert!(doc.validate().is_err());
}

#[test]
fn test_did_document_with_services() {
    let mut doc = DIDDocument::new("did:example:with-services");
    let svc = kyc_vault_did::service::Service::new(
        "did:example:with-services#kyc-api".into(),
        "KYCVerificationService".into(),
        "https://api.kyc.example.com/v1".into(),
    );
    doc.add_service(svc);

    let svc2 = kyc_vault_did::service::Service::new(
        "did:example:with-services#didcomm".into(),
        "DIDCommMessaging".into(),
        "https://didcomm.example.com".into(),
    );
    doc.add_service(svc2);

    assert_eq!(doc.service.len(), 2);
    assert_eq!(doc.service[0].service_type, "KYCVerificationService");
}

#[test]
fn test_verification_method_ed25519() {
    let key_bytes = [0x01u8; 32];
    let vm = VerificationMethod::new_ed25519(
        "did:key:z6Mkf#z6Mkf".into(),
        "did:key:z6Mkf".into(),
        &key_bytes,
    );
    assert_eq!(
        vm.verification_type,
        VerificationType::Ed25519VerificationKey2020
    );
    assert!(vm.public_key_multibase.is_some());
    assert!(vm.public_key_multibase.as_ref().unwrap().starts_with("z"));
}

#[test]
fn test_did_document_json_roundtrip() {
    let doc = DIDDocument::new("did:example:roundtrip");
    let json = doc.to_json().unwrap();
    let restored = DIDDocument::from_json(&json).unwrap();
    assert_eq!(restored.id, doc.id);
    assert_eq!(restored.context, doc.context);
}

#[test]
fn test_resolve_did_key_produces_valid_verification_method() {
    let doc = methods::resolve_did_key("z6MkfTestKey").unwrap();
    assert_eq!(doc.verification_method.len(), 1);
    assert_eq!(doc.authentication.len(), 1);
    assert_eq!(
        doc.verification_method[0].verification_type,
        VerificationType::Ed25519VerificationKey2020
    );
}
