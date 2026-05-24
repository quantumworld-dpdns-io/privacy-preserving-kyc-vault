# KYC Vault — Threat Model (STRIDE per Component)

> **Document Version:** 1.0
> **Last Updated:** 2026-05-24
> **Review Frequency:** Quarterly or on major architecture changes

---

## Methodology

Threats are classified using the STRIDE framework per system component.
Each threat is rated with a qualitative risk (High / Medium / Low).

| Letter | Threat | Definition |
|--------|--------|------------|
| S | Spoofing | Impersonating a user, service, or DID |
| T | Tampering | Modifying data or code without authorization |
| R | Repudiation | Denying an action without audit trail |
| I | Information Disclosure | Exposing data to unauthorized parties |
| D | Denial of Service | Degrading or disrupting service availability |
| E | Elevation of Privilege | Gaining unauthorized access or permissions |

---

## 1. API Gateway (Fastify/Actix)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| GW-01 | S | Attacker spoofs API key or JWT to impersonate a valid client | High | API key rotation, JWT validation with JWKS, short-lived tokens |
| GW-02 | T | Request body tampering during transit (no TLS) | High | Enforce TLS 1.3; mTLS for inter-service |
| GW-03 | T | Mass assignment on credential creation (injecting extra attributes) | Medium | Strict JSON schema validation per endpoint |
| GW-04 | R | Missing audit log for incoming requests | Medium | All requests logged with trace ID, timestamp, and principal |
| GW-05 | I | Verbose error messages leaking stack traces or internal state | Medium | Sanitized error responses; internal errors logged server-side |
| GW-06 | D | Resource exhaustion via large payloads (ZKP proofs, DID docs) | High | Request size limits, rate limiting, connection pooling |
| GW-07 | E | Path traversal to access internal endpoints | High | Prefix-based routing with allowlist; no regex routing |
| GW-08 | S | Attacker replays a captured credential issuance request | Medium | Nonce / timestamp in request body; idempotency keys |

## 2. Credential Service (Go)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| CS-01 | S | Attacker signs credentials with compromised issuer key | Critical | Hardware-backed key storage (Vault); key rotation |
| CS-02 | T | Credential attribute tampering after issuance | High | Digital signature on credential; revocation mechanism |
| CS-03 | I | PII leakage through credential query parameters | High | Encrypted credential payload; access control |
| CS-04 | I | Credential status oracle (checking if a DID exists via timings) | Medium | Constant-time responses; batch status checks |
| CS-05 | D | Targeted revocation of all credentials for a DID | Low | Rate-limited revocation; admin approval for bulk ops |
| CS-06 | E | Credential delegation without proper authorization | Medium | Chain-of-authority verification; depth limits |
| CS-07 | R | Issuer denies issuing a credential | Medium | Signed audit trail with Rekor timestamp |

## 3. DID Resolver (Rust)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| DR-01 | S | Attacker registers a malicious DID pointing to attacker-controlled keys | High | Proof-of-control (sign challenge with claimed key) |
| DR-02 | T | DID document modification by unauthorized party | High | Signature verification on DID update |
| DR-03 | I | DID enumeration (scannable DID range) | Medium | Non-sequential DIDs; rate limiting on resolution |
| DR-04 | I | DID document leaks private key material | Critical | Strip private keys from DID documents |
| DR-05 | D | Resource exhaustion via recursive DID resolution | Medium | Max resolution depth (3); loop detection |
| DR-06 | S | DID method confusion (kyc vs key vs web) | Medium | Method-specific validation rules |
| DR-07 | E | Universal resolver plugin sandbox escape | Medium | Sandboxed WASM runtime for resolver plugins |

## 4. ZKP Engine (Rust/Actix)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| ZK-01 | S | Attacker submits proof generated with incorrect circuit | High | Circuit hash verified with proof; trusted setup verification |
| ZK-02 | T | Proof malleability allows changing public inputs after generation | High | Fiat-Shamir transform binding; proof verification |
| ZK-03 | I | Side-channel leakage during proof generation (timing, power) | Medium | Constant-time operations; blinded generation |
| ZK-04 | I | Toxic waste exposure from trusted setup | Critical | Secure multi-party computation (MPC); audit |
| ZK-05 | D | Resource exhaustion from expensive proof verification | Medium | Verification cost limits; GPU acceleration monitoring |
| ZK-06 | R | Prover denies generating a proof | Medium | Non-interactive proof binds prover's DID |
| ZK-07 | E | Circuit substitution attack (use different circuit than intended) | High | Circuit ID in proof; on-chain verification |

## 5. Compliance Service (Go)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| CP-01 | S | Spoofed sanctions list update | High | GPG-signed sanctions lists; verify before loading |
| CP-02 | I | Sanctions screening result leakage | High | Only return binary pass/fail; no match detail |
| CP-03 | I | Jurisdiction bypass (claim wrong jurisdiction) | Medium | IP geo-lookup verification; jurisdiction proof |
| CP-04 | D | Sanctions database DoS (extremely large input) | Low | Input size limits; async processing |
| CP-05 | E | Bypass compliance check via direct service call | High | mTLS required for all inter-service calls |

## 6. Database (PostgreSQL)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| DB-01 | S | Unauthenticated database access | Critical | Network policy; password auth; client certs |
| DB-02 | T | SQL injection via credential queries | High | Parameterized queries; ORM (SQLx) with typed queries |
| DB-03 | I | Data at rest compromise | High | Transparent data encryption (TDE); column-level encryption for PII |
| DB-04 | I | Backup file exposure | High | Encrypted backups; access control on backup storage |
| DB-05 | D | Connection pool exhaustion | Medium | Max connections; query timeouts; pooling |

## 7. Redis Cache

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| RC-01 | S | Unauthenticated Redis access | Critical | Redis password; network policy; TLS |
| RC-02 | T | Cache poisoning (stale/invalid data) | Medium | TTL on cached credentials; invalidation on revocation |
| RC-03 | I | Credential data leaked via Redis | High | Encrypt cached values; ACL restricted keyspace |
| RC-04 | D | Redis memory exhaustion (no eviction policy) | Medium | allkeys-lru eviction; memory limits |

## 8. Message Queue (Kafka)

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| KF-01 | S | Unauthenticated producer/consumer | High | SASL/SCRAM authentication; ACLs per topic |
| KF-02 | T | Message tampering in transit | High | TLS encryption between brokers and clients |
| KF-03 | I | Sensitive data in topic names or headers | Medium | Sanitize topic names; encrypt message payloads |
| KF-04 | D | Topic flooding (unlimited produce rate) | Medium | Quota configuration per client |

## 9. Container Infrastructure

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| CI-01 | S | Compromised base image with backdoor | Critical | Image signing (Notary); vulnerability scanning (Clair) |
| CI-02 | T | Container runtime modification | High | Read-only root filesystem; immutable container |
| CI-03 | I | Sidecar container reading secrets from main container | Medium | Ephemeral volumes; strict service account permissions |
| CI-04 | E | Container breakout via kernel exploit | High | Seccomp; AppArmor; non-root user; limited capabilities |
| CI-05 | D | Resource exhaustion on shared node | Medium | Resource limits; pod priority classes |

## 10. Supply Chain

| ID | STRIDE | Threat | Risk | Mitigation |
|----|--------|--------|------|------------|
| SC-01 | S | Malicious dependency substitution | High | Dependency lock files; vendored deps; Cargo/npm audit |
| SC-02 | T | Build artifact tampering | High | Reproducible builds; SLSA Level 3 provenance |
| SC-03 | R | Missing provenance for release artifacts | Medium | Sigstore signing; Rekor transparency log |
| SC-04 | I | SBOM leaks internal dependency details | Low | Public SBOM with non-sensitive data only |

---

## Risk Matrix

| Component | S | T | R | I | D | E |
|-----------|---|---|---|---|---|---|
| API Gateway | H | H | M | M | H | H |
| Credential Service | C | H | M | H | L | M |
| DID Resolver | H | H | L | H | M | M |
| ZKP Engine | H | H | L | H | M | H |
| Compliance Service | H | M | L | H | L | H |
| Database | C | H | L | H | M | C |
| Redis | C | M | L | H | M | C |
| Kafka | H | H | L | M | M | H |
| Container Infra | C | H | L | M | M | H |
| Supply Chain | H | H | M | L | L | H |

*C = Critical, H = High, M = Medium, L = Low*

---

## Threat Response Playbook

See [`incident_response_playbook.md`](./incident_response_playbook.md) for detailed response procedures for each threat category.

---

## Review Log

| Date | Reviewer | Changes |
|------|----------|---------|
| 2026-05-24 | Security Team | Initial threat model |
