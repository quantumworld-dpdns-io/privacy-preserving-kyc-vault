# ADR-001: Architecture Overview — Hexagonal + Event-Driven

**Status:** Accepted  
**Date:** 2026-05-24  
**Deciders:** Architecture Team

## Context
The KYC vault must support multiple integration patterns (REST, gRPC, MCP, GraphQL), process async verification workflows, and remain testable in isolation.

## Decision
Use hexagonal (ports & adapters) architecture combined with event-driven communication:
- **Core domain** — DID, KYC, ZKP, Credential logic (no framework dependencies)
- **Ports** — interfaces for storage, messaging, crypto, AI
- **Adapters** — Postgres, Redis, Kafka, Weaviate, Ollama, TEE implementations
- **Events** — domain events via Kafka/Redis pub-sub for async workflows
- **CQRS** — separate read models for dashboards, write models for commands

## Consequences
+ Domain logic remains testable without infrastructure
+ Pluggable storage backends (vector DB, lakehouse) via port adapters
+ Event sourcing enables audit trail and replay
- More boilerplate for port/ adapter wiring
- Eventual consistency must be handled in UI

## Compliance
- NIST SP 800-53 AC-3 (access enforcement)
- GDPR Art 25 (data protection by design)
