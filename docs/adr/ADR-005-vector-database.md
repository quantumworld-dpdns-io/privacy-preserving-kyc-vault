# ADR-005: Vector Database Selection

**Status:** Accepted  
**Date:** 2026-05-24

## Context
Credential retrieval requires semantic search over embedding vectors. Need multi-tenancy, hybrid search, and horizontal scaling.

## Decision
Weaviate as primary vector database:
- Hybrid search (vector + keyword) with BM25 fusion
- Native multi-tenancy for platform isolation
- HNSW index with configurable efConstruction and M parameters
- gRPC API for low-latency queries
- Text2Vec-transformers module for local embedding

Secondary integrations for specific use cases:
- Chroma for development and testing
- Qdrant for Rust-native high-throughput scenarios
- Milvus for GPU-accelerated indexing at scale
- LanceDB for multi-modal (image + text) storage

## Consequences
+ Weaviate native multi-tenancy simplifies data isolation
+ Hybrid search catches more relevant credentials
- Running text2vec-transformers requires GPU or significant CPU
- Multiple backends increase infrastructure complexity
