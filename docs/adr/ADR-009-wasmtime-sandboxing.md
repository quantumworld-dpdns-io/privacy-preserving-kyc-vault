# ADR-009: Wasmtime Sandboxing for Untrusted Verifier Code

**Status:** Accepted  
**Date:** 2026-05-24

## Context
Platform partners may submit custom verification logic or policy scripts. Running these directly on the host poses security risks. Cannot use Docker for each policy (too heavy, slow spin-up).

## Decision
Use Wasmtime as the sandboxed runtime for untrusted verifier code:
- WASI 0.3 preview for async operations
- Fuel metering for compute cost enforcement
- Memory limits per module instance
- Capability-based permissions (no filesystem by default)
- Module signature verification for trusted distribution
- Pre-compilation caching for fast instantiation
- Fermyon Spin for event-driven Wasm microservices

## Consequences
+ Near-native execution speed with sandbox guarantees
+ Sub-millisecond instantiation vs seconds for Docker
+ Fuel metering enables pay-per-compute pricing
- Limited system call surface (WASI still evolving)
- Requires Rust/AssemblyScript/Wasm-target language for custom modules

## References
- Wasmtime documentation
- WASI 0.3 spec
- Fermyon Spin documentation
