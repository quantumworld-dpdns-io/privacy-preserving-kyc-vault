# ADR-002: DID Method Selection

**Status:** Accepted  
**Date:** 2026-05-24

## Context
The vault requires cross-platform decentralized identifiers. Multiple DID methods exist with different tradeoffs.

## Decision
Support three DID methods via pluggable resolver:
1. **did:key** — Static key-based, no blockchain dependency, for ephemeral/offline use
2. **did:web** — DNS-based, for platform-owned identifiers, easy to integrate
3. **did:ethr** — Ethereum-based, for on-chain verifiable registrations

## Consequences
+ Interoperability with W3C DID standard and multiple ecosystems
+ Users choose method based on their platform requirements
- Must maintain and test 3 resolver implementations
- did:ethr requires Ethereum RPC access

## References
- W3C DID Core 1.0
- did:key, did:web, did:ethr method specs
