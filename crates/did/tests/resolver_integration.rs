use kyc_vault_did::document::DIDDocument;
use kyc_vault_did::error::DIDError;
use kyc_vault_did::methods::{self, DIDMethod};
use kyc_vault_did::resolver::DIDResolver;

#[tokio::test]
async fn test_resolve_did_key_method() {
    let resolver = DIDResolver::new();
    let doc = resolver.resolve("did:key:z6MkfTestKeyABC").await.unwrap();
    assert!(doc.id.contains("did:key:"));
    assert!(doc.verification_method.len() == 1);
    assert!(doc.authentication.len() == 1);
}

#[tokio::test]
async fn test_cache_hit_returns_same_document() {
    let resolver = DIDResolver::new();
    let doc1 = resolver.resolve("did:key:z6MkfCacheHitTest").await.unwrap();
    let doc2 = resolver.resolve("did:key:z6MkfCacheHitTest").await.unwrap();
    assert_eq!(doc1.id, doc2.id);
    assert_eq!(doc1.verification_method.len(), doc2.verification_method.len());
}

#[tokio::test]
async fn test_cache_miss_resolves_and_caches() {
    let resolver = DIDResolver::new();
    let doc = resolver.resolve("did:key:z6MkfCacheMiss").await.unwrap();
    assert_eq!(doc.id, "did:key:z6MkfCacheMiss");

    let cached = resolver.resolve("did:key:z6MkfCacheMiss").await.unwrap();
    assert_eq!(cached.id, doc.id);
}

#[tokio::test]
async fn test_invalidate_cache_forces_re_resolve() {
    let resolver = DIDResolver::new();
    resolver.resolve("did:key:z6MkfInvalidateTest").await.unwrap();
    resolver.invalidate_cache("did:key:z6MkfInvalidateTest").await;
    let doc = resolver.resolve("did:key:z6MkfInvalidateTest").await.unwrap();
    assert_eq!(doc.id, "did:key:z6MkfInvalidateTest");
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
async fn test_invalid_did_returns_invalid_error() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("not-a-did").await;
    assert!(result.is_err());
    match result.unwrap_err() {
        DIDError::InvalidDID(_) => {}
        other => panic!("Expected InvalidDID, got {:?}", other),
    }
}

#[tokio::test]
async fn test_invalid_did_missing_method() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("did:").await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_empty_did_returns_error() {
    let resolver = DIDResolver::new();
    let result = resolver.resolve("").await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_resolve_with_metadata_includes_duration() {
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

#[test]
fn test_parse_all_did_methods() {
    let (method, msi) = methods::parse_did("did:key:z6Mkf123").unwrap();
    assert_eq!(method, DIDMethod::Key);
    assert_eq!(msi, "z6Mkf123");

    let (method, msi) = methods::parse_did("did:web:example.com:path").unwrap();
    assert_eq!(method, DIDMethod::Web);
    assert_eq!(msi, "example.com:path");

    let (method, msi) = methods::parse_did("did:ethr:0xabc:123").unwrap();
    assert_eq!(method, DIDMethod::Ethr);
    assert_eq!(msi, "0xabc:123");
}

#[test]
fn test_did_document_validation() {
    let valid = DIDDocument::new("did:example:valid123");
    assert!(valid.validate().is_ok());

    let invalid = DIDDocument::new("not-a-did");
    assert!(invalid.validate().is_err());
}

#[test]
fn test_did_document_json_roundtrip() {
    let doc = DIDDocument::new("did:example:roundtrip123");
    let json = doc.to_json().unwrap();
    let restored = DIDDocument::from_json(&json).unwrap();
    assert_eq!(restored.id, doc.id);
    assert_eq!(restored.context.len(), doc.context.len());
}

#[test]
fn test_resolve_did_key_produces_valid_document() {
    let doc = methods::resolve_did_key("z6MkfUnitTestKey").unwrap();
    assert_eq!(doc.verification_method.len(), 1);
    assert!(doc.authentication.contains(
        &format!("{}#{}", doc.id, "z6MkfUnitTestKey")
    ));
}
