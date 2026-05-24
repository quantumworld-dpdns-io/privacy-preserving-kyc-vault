use crate::document::DIDDocument;
use crate::error::DIDError;
use crate::methods::{self, DIDMethod};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub type ResolverFn = Arc<dyn Fn(&str) -> Result<DIDDocument, DIDError> + Send + Sync>;

pub struct DIDResolver {
    resolvers: HashMap<DIDMethod, ResolverFn>,
    cache: Arc<RwLock<HashMap<String, CachedDocument>>>,
    cache_ttl: std::time::Duration,
}

struct CachedDocument {
    doc: DIDDocument,
    cached_at: std::time::Instant,
}

impl DIDResolver {
    pub fn new() -> Self {
        let mut resolvers: HashMap<DIDMethod, ResolverFn> = HashMap::new();

        resolvers.insert(DIDMethod::Key, Arc::new(|msi| {
            methods::resolve_did_key(msi)
        }));

        resolvers.insert(DIDMethod::Web, Arc::new(|msi| {
            let block = tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current().block_on(resolve_did_web(msi))
            });
            block
        }));

        Self {
            resolvers,
            cache: Arc::new(RwLock::new(HashMap::new())),
            cache_ttl: std::time::Duration::from_secs(300),
        }
    }

    pub fn register_method(&mut self, method: DIDMethod, resolver: ResolverFn) {
        self.resolvers.insert(method, resolver);
    }

    pub async fn resolve(&self, did: &str) -> Result<DIDDocument, DIDError> {
        {
            let cache = self.cache.read().await;
            if let Some(cached) = cache.get(did) {
                if cached.cached_at.elapsed() < self.cache_ttl {
                    return Ok(cached.doc.clone());
                }
            }
        }

        let (method, method_specific_id) = methods::parse_did(did)?;

        let resolver = self
            .resolvers
            .get(&method)
            .ok_or_else(|| DIDError::UnsupportedMethod(method.as_str().to_string()))?;

        let mut doc = (resolver)(&method_specific_id)?;

        doc.created = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()
                .to_string(),
        );

        {
            let mut cache = self.cache.write().await;
            cache.insert(
                did.to_string(),
                CachedDocument {
                    doc: doc.clone(),
                    cached_at: std::time::Instant::now(),
                },
            );
        }

        Ok(doc)
    }

    pub async fn resolve_with_metadata(&self, did: &str) -> Result<(DIDDocument, ResolutionMetadata), DIDError> {
        let start = std::time::Instant::now();
        let doc = self.resolve(did).await?;
        let duration = start.elapsed();

        Ok((
            doc,
            ResolutionMetadata {
                duration,
                resolved_at: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                resolver_type: "universal".to_string(),
            },
        ))
    }

    pub async fn invalidate_cache(&self, did: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(did);
    }
}

pub struct ResolutionMetadata {
    pub duration: std::time::Duration,
    pub resolved_at: u64,
    pub resolver_type: String,
}

async fn resolve_did_web(domain: &str) -> Result<DIDDocument, DIDError> {
    let url = format!("https://{}/.well-known/did.json", domain);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| DIDError::NetworkError(e))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| DIDError::ResolutionError(format!("HTTP request: {}", e)))?;

    if !resp.status().is_success() {
        return Err(DIDError::NotFound(format!("did:web:{} not found at {}", domain, url)));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| DIDError::ResolutionError(format!("HTTP body: {}", e)))?;

    DIDDocument::from_json(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_resolve_did_key() {
        let resolver = DIDResolver::new();
        let doc = resolver.resolve("did:key:z6Mkf").await;
        assert!(doc.is_ok());
        assert_eq!(doc.unwrap().id, "did:key:z6Mkf");
    }

    #[tokio::test]
    async fn test_cache_hit() {
        let resolver = DIDResolver::new();
        let doc1 = resolver.resolve("did:key:z6Mkf").await.unwrap();
        let doc2 = resolver.resolve("did:key:z6Mkf").await.unwrap();
        assert_eq!(doc1.id, doc2.id);
    }

    #[tokio::test]
    async fn test_unsupported_method() {
        let resolver = DIDResolver::new();
        let result = resolver.resolve("did:unsupported:123").await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), DIDError::UnsupportedMethod(_));
    }
}
