# ADR-008: Teaclave TEE for Confidential Credential Processing

**Status:** Accepted  
**Date:** 2026-05-24

## Context
KYC processing involves handling PII (personally identifiable information) that must be protected even from the vault operator. Regulatory requirements mandate data minimization and access controls.

## Decision
Use Apache Teaclave for confidential computing enclaves:
- PII decryption and classification inside Intel SGX/AMD SEV-SNP enclaves
- KYC decision logic execution in attested TEEs
- Input sealing for data at rest, output sealing for results
- Remote Attestation (RA) via Intel DCAP/AMD ASP
- Multi-function composition for KYC workflow inside enclave

## Consequences
+ PII never accessible to vault operators or cloud provider
+ Attestation provides cryptographic proof of correct execution
+ Compliance with GDPR Article 28 (processor obligations)
- SGX memory limitations (128-512MB EPC)
- Performance overhead for enclave transitions (5-15%)

## References
- Apache Teaclave documentation
- Intel SGX DCAP attestation
- NIST SP 800-190 (Trusted Execution Environments)
