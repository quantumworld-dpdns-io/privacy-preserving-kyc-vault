# ADR-004: Post-Quantum Cryptography

**Status:** Accepted  
**Date:** 2026-05-24

## Context
KYC credentials must remain secure against future quantum attacks. Migration to PQC must be backward-compatible.

## Decision
Integrate liboqs for NIST-standardized PQC algorithms:
- **ML-KEM (FIPS 203)** — Key encapsulation, replace ECDH
- **ML-DSA (FIPS 204)** — Lattice-based signatures, replace ECDSA
- **SLH-DSA (FIPS 205)** — Stateless hash-based signatures for long-term security
- Hybrid mode (X25519 + ML-KEM, Ed25519 + ML-DSA) during transition

## Consequences
+ Future-proof against CRQC (Cryptographically Relevant Quantum Computer)
+ FIPS compliance for government/regulated use
- Larger keys and signatures (ML-KEM ciphertext ~1KB vs ECDH ~32B)
- Proving time impact in ZK circuits with PQ operations

## References
- NIST IR 8545 (Transition to PQC)
- CNSA 2.0 (Commercial National Security Algorithm Suite 2.0)
