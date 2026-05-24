# ADR-003: ZKP Strategy — Noir + RISC Zero

**Status:** Accepted  
**Date:** 2026-05-24

## Context
Privacy-preserving KYC requires selective disclosure of identity attributes. Users should prove age >= 21 without revealing DOB.

## Decision
Dual ZKP approach:
1. **Noir** — DSL for application-specific zkSNARK circuits (age verification, range proofs, set membership)
2. **RISC Zero** — zkVM for general-purpose verifiable computation (document processing, ML inference)
3. **BBS+** — For multi-message selective disclosure in Verifiable Credentials

## Consequences
+ Noir circuits are efficient and auditable
+ RISC Zero enables complex program verification
+ BBS+ provides standard-compliant selective disclosure
- Two proving systems increase maintenance
- Proving time varies by circuit complexity

## Compliance
- W3C VC Data Model 2.0 with BBS+ proof
- EU eIDAS 2.0 (forthcoming) alignment
