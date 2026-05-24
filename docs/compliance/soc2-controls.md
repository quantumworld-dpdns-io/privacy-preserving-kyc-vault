# SOC 2 Control Mapping

## Scope

This document maps SOC 2 Trust Service Criteria (TSC) to specific controls implemented in the KYC Vault platform. The mapping covers all five trust principles: Security (CC6-CC9), Availability (A1), Processing Integrity (PI1), Confidentiality (C1), and Privacy (P1).

## Security — Common Criteria (CC)

### CC1: Control Environment

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC1.1 | Integrity and ethical values communicated | Code of conduct in CONTRIBUTING.md, security policy in SECURITY.md | `docs/CONTRIBUTING.md`, `docs/SECURITY.md` |
| CC1.2 | Board oversight of controls | Architecture review board in ADR process | `docs/adr/ADR*.md` |
| CC1.3 | Organizational structure defined | Team roles in OPERATIONS.md incident response | `docs/OPERATIONS.md` |
| CC1.4 | Competence committed to | CI/CD requires passing tests and linting | `.github/workflows/ci.yml` |
| CC1.5 | Accountability enforced | Signed commits, PR approvals required | `.github/workflows/ci.yml` |

### CC2: Communication and Information

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC2.1 | Information obtained and communicated | OpenTelemetry tracing across services | `opentelemetry-collector.yml` |
| CC2.2 | Communication with external parties | Webhook relay for event notifications | `crates/core/src/platform.rs` |
| CC2.3 | Internal communication | Structured logging via tracing-subscriber | `Cargo.toml` (tracing deps) |
| CC2.4 | Whistleblower mechanisms | N/A (org-level policy, not system) | — |

### CC3: Risk Assessment

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC3.1 | Risk identification | Semgrep SAST, OWASP ZAP DAST, Trivy scanning | `.semgrep.yml`, `.github/workflows/security-scan.yml` |
| CC3.2 | Risk analysis | Fuzz testing (cargo-fuzz, Jazzer.js) | `tests/fuzz/` |
| CC3.3 | Risk response | Incident response runbook | `docs/runbooks/incident-response.md` |
| CC3.4 | Risk monitoring | Continuous monitoring via Grafana + Prometheus | `deploy/prometheus/alerts.yml` |

### CC4: Monitoring Activities

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC4.1 | Monitoring of controls | Tetragon eBPF process monitoring | `deploy/tetragon/tracing_policy.yaml` |
| CC4.2 | Timely evaluation | Prometheus Alertmanager → PagerDuty escalation | `docs/runbooks/incident-response.md` |
| CC4.3 | Remediation tracking | Post-mortem action items tracked in GitHub Issues | `docs/runbooks/incident-response.md` |

### CC5: Control Activities — Risk Assessment

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC5.1 | Control activities defined | Security controls in SECURITY.md defense-in-depth | `docs/SECURITY.md` |
| CC5.2 | Technology acquisition | Dependabot + cargo-audit for dependency review | `.github/workflows/security-scan.yml` |
| CC5.3 | Control implementation | 9-layer defense in depth architecture | `docs/ARCHITECTURE.md` |

### CC6: Logical and Physical Access

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC6.1 | Logical access security | JWT + mTLS + RBAC authentication | `docs/SECURITY.md:73` |
| CC6.2 | Physical access | AWS data center controls (shared responsibility) | — |
| CC6.3 | User access provisioning | API key management via HashiCorp Vault | `docs/DEPLOYMENT.md:127` |
| CC6.4 | User access removal | Vault lease revocation, key rotation | `docs/runbooks/key-compromise.md:101` |
| CC6.5 | Authentication controls | Bearer JWT with Ed25519 signing | `crates/crypto-pqc/src/key_management.rs` |
| CC6.6 | Encryption of data at rest | AES-256 (SSE-KMS) for RDS, S3, Redis, Kafka | `docs/SECURITY.md:107` |
| CC6.7 | Encryption of data in transit | TLS 1.3 + mTLS for all inter-service communication | `docs/SECURITY.md:117` |
| CC6.8 | Malware protection | Container scanning via Trivy in CI/CD | `.github/workflows/docker-build.yml` |

### CC7: System Operations

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC7.1 | System baseline | Helm chart with immutable infrastructure | `charts/kyc-vault/` |
| CC7.2 | Monitoring of infrastructure | Prometheus + Loki + Grafana + OTEL | `opentelemetry-collector.yml` |
| CC7.3 | Incident response process | Full IR runbook: detection → triage → containment → recovery → post-mortem | `docs/runbooks/incident-response.md` |
| CC7.4 | System recovery | Disaster recovery plan with RTO/RPO per service | `docs/runbooks/disaster-recovery.md` |
| CC7.5 | Business continuity | Backup verification, DR testing schedule | `docs/runbooks/disaster-recovery.md:369` |

### CC8: Change Management

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC8.1 | Change authorization | PR approval, CI/CD pipeline, signed commits | `.github/workflows/ci.yml` |
| CC8.2 | Change testing | Unit + integration + Robot Framework + K6 load tests | `justfile:30`, `tests/` |
| CC8.3 | Change tracking | Nx affected commands, ADR process for architecture | `nx.json`, `docs/adr/` |
| CC8.4 | Security impact analysis | Semgrep SAST, OWASP Top 10 Robot tests | `tests/robot/owasp_top10.robot` |
| CC8.5 | Configuration changes | GitOps with Helm, config changes via PR | `charts/kyc-vault/values.yaml` |
| CC8.6 | Emergency changes | Helm rollback procedure in DEPLOYMENT.md | `docs/DEPLOYMENT.md:198` |

### CC9: Risk Mitigation

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| CC9.1 | Vendor risk | Dependency audit (Dependabot, cargo-audit) | `.github/workflows/security-scan.yml` |
| CC9.2 | Fraud detection | AI inference + federated learning (Flower, FLARE) | `crates/core/src/kyc/workflow.rs` |
| CC9.3 | Legal/regulatory compliance | Consent tokens, data classification, retention policy | `crates/core/src/platform.rs:28` |

## Availability (A1)

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| A1.1 | Capacity management | HPA scaling, resource limits, K6 load tests | `charts/kyc-vault/`, `tests/load/` |
| A1.2 | Backup and recovery | Daily pg_dump, WAL streaming, cross-region S3 replication | `docs/runbooks/disaster-recovery.md:68` |
| A1.3 | Disaster recovery | Multi-region DR with RTO 5min-2hr, RPO 0-1hr | `docs/runbooks/disaster-recovery.md` |
| A1.4 | Incident response | PagerDuty escalation, SLA-driven severity levels | `docs/runbooks/incident-response.md:280` |

## Processing Integrity (PI1)

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| PI1.1 | Complete processing | KYC state machine validates all transitions | `crates/core/src/kyc/workflow.rs:110` |
| PI1.2 | Accurate processing | Schema validation for credential attributes | `crates/core/src/schema.rs:66` |
| PI1.3 | Authorized processing | Consent tokens, platform config validation | `crates/core/src/platform.rs:58` |
| PI1.4 | Timely processing | LangGraph workflow with timeouts and expiry | `crates/core/src/kyc/workflow.rs:25` |

## Confidentiality (C1)

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| C1.1 | Confidential information identified | Data classification levels (Public → Critical) | `crates/core/src/schema.rs:38` |
| C1.2 | Confidentiality protection | TEE enclave processing, Wasm sandboxing, PQC encryption | `crates/tee/src/lib.rs`, `crates/wasm-runtime/src/` |
| C1.3 | Confidentiality breaches | Key compromise runbook, audit log review | `docs/runbooks/key-compromise.md` |

## Privacy (P1)

| Ref | Control | Implementation | Evidence Location |
|-----|---------|---------------|-------------------|
| P1.1 | Notice | Consent tokens presented to subject | `crates/core/src/platform.rs:28` |
| P1.2 | Choice and consent | Granular consent with scope-based tokens | `crates/core/src/platform.rs:28` |
| P1.3 | Collection limitation | Selective disclosure via ZKPs, minimal data collection | `circuits/noir/src/` |
| P1.4 | Use and retention | Data retention policy with automated purging | `docs/compliance/retention-policy.md` |
| P1.5 | Access | Right to access via credential retrieval API | `crates/core/src/credential.rs` |
| P1.6 | Disclosure | Third-party disclosures logged in audit trail | `crates/core/src/kyc/workflow.rs:66` |
| P1.7 | Quality | Schema validation ensures data quality | `crates/core/src/schema.rs` |
| P1.8 | Monitoring and enforcement | Revocation lists, credential status checks | `crates/core/src/status.rs` |

## Evidence Collection Methods

| Evidence Type | Tool | Frequency | Retention |
|---------------|------|-----------|-----------|
| Access logs | Loki | Real-time | 90 days |
| Audit logs | S3 immutable bucket | Real-time | 7 years |
| System metrics | Prometheus | 15s scrape | 90 days |
| Code reviews | GitHub PRs | Per change | Permanent |
| Security scans | Semgrep, Trivy, OWASP ZAP | Every commit + weekly | 1 year |
| Penetration tests | External firm | Annual | 3 years |
| Incident reports | Post-mortem | Per incident | 7 years |
| SOC reports | External auditor | Annual | Current + 2 prior |
