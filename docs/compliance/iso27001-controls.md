# ISO 27001 Annex A Control Mapping

## Scope

This document maps ISO 27001:2022 Annex A controls to specific implementations in the KYC Vault platform. Controls are organized by the four ISO 27001:2022 themes: Organizational (A.5), People (A.6), Physical (A.7), and Technological (A.8).

## A.5 — Organizational Controls

| Ref | Control Name | Implementation | Evidence Location |
|-----|-------------|---------------|-------------------|
| A.5.1 | Information security policy | Security documentation in SECURITY.md | `docs/SECURITY.md` |
| A.5.2 | Information security roles | Response roles in incident runbook | `docs/runbooks/incident-response.md:18` |
| A.5.3 | Segregation of duties | PR approval required, separate CI/CD stages | `.github/workflows/ci.yml` |
| A.5.4 | Management responsibilities | Architecture Decision Records, review process | `docs/adr/ADR*.md` |
| A.5.5 | Contact with authorities | Regulatory compliance sections | `docs/compliance/gdpr-articles.md` |
| A.5.6 | Contact with special interest groups | Open-source dependency community engagement | `SECURITY.md` (vulnerability disclosure) |
| A.5.7 | Threat intelligence | Semgrep rules, OWASP Top 10 testing | `tests/robot/owasp_top10.robot` |
| A.5.8 | Information security in project management | ADR process, CI/CD gates | `docs/adr/ADR-001-hexagonal-event-driven-architecture.md` |
| A.5.9 | Inventory of information | Data classification policy | `docs/compliance/data-classification.md` |
| A.5.10 | Acceptable use of information | Platform consent tokens, data minimization | `crates/core/src/platform.rs` |
| A.5.11 | Return of assets | API key revocation process | `docs/runbooks/key-compromise.md:101` |
| A.5.12 | Classification of information | SensitivityLevel enum: Public → Critical | `crates/core/src/schema.rs:38` |
| A.5.13 | Labeling of information | Schema attribute sensitivity labels | `crates/core/src/schema.rs` |
| A.5.14 | Information transfer | TLS 1.3 + mTLS for inter-service comms | `docs/SECURITY.md:117` |
| A.5.15 | Access control | JWT + mTLS + RBAC multi-layer auth | `docs/SECURITY.md:73` |
| A.5.16 | Identity management | DID-based identity (did:key, did:web, did:ethr) | `crates/did/src/` |
| A.5.17 | Authentication information | Ed25519 JWT signing, API key HMAC | `crates/crypto-pqc/src/key_management.rs` |
| A.5.18 | Access rights | Vault-controlled access, lease-based credentials | `docs/DEPLOYMENT.md:127` |
| A.5.19 | Information security in supplier relationships | Dependabot + cargo-audit + npm audit | `.github/workflows/security-scan.yml` |
| A.5.20 | Addressing security in supplier agreements | Open-source license compliance | `LICENSE` |
| A.5.21 | Managing security in cloud services | AWS shared responsibility model, IRSA | `deploy/terraform/` |
| A.5.22 | Monitoring and review of supplier services | Dependency scanning in CI | `.github/workflows/security-scan.yml` |
| A.5.23 | Information security for use of cloud services | AWS KMS, IAM roles, VPC security | `deploy/terraform/` |
| A.5.24 | Information security incident management | Incident response runbook, PagerDuty | `docs/runbooks/incident-response.md` |
| A.5.25 | Responsibilities during incidents | Defined roles: IC, Scribe, Tech Lead, Security Lead | `docs/runbooks/incident-response.md:18` |
| A.5.26 | Response to information security incidents | 6-phase IR process with SLAs | `docs/runbooks/incident-response.md` |
| A.5.27 | Learning from information security incidents | Post-mortem with 5 Whys analysis | `docs/runbooks/incident-response.md:246` |
| A.5.28 | Collection of evidence | Forensic snapshot, log collection, chain of custody | `docs/runbooks/key-compromise.md:207` |
| A.5.29 | Information security during disruption | Disaster recovery plan, RTO/RPO per service | `docs/runbooks/disaster-recovery.md` |
| A.5.30 | ICT readiness for business continuity | DR testing schedule, failover runbooks | `docs/runbooks/disaster-recovery.md:369` |
| A.5.31 | Legal and regulatory compliance | GDPR Article mapping, data retention policies | `docs/compliance/gdpr-articles.md`, `docs/compliance/retention-policy.md` |
| A.5.32 | Intellectual property rights | MIT License, open-source compliance | `LICENSE` |
| A.5.33 | Protection of records | Immutable audit logs in S3, 7-year retention | `docs/compliance/retention-policy.md` |
| A.5.34 | Privacy and protection of PII | ZKP selective disclosure, consent tokens, TEE processing | `docs/compliance/gdpr-articles.md` |
| A.5.35 | Independent review of information security | Annual penetration test, external SOC 2 audit | — |
| A.5.36 | Compliance with policies and rules | Automated CI checks, Git hooks (lefthook) | `.lefthook.yml` |
| A.5.37 | Documented operating procedures | All runbooks in `docs/runbooks/` | `docs/runbooks/*.md` |

## A.6 — People Controls

| Ref | Control Name | Implementation | Evidence Location |
|-----|-------------|---------------|-------------------|
| A.6.1 | Screening | Background check policy (org-level) | — |
| A.6.2 | Terms and conditions | Code of conduct in CONTRIBUTING.md | `docs/CONTRIBUTING.md` |
| A.6.3 | Information security awareness | Training documentation in runbooks | `docs/runbooks/*.md` |
| A.6.4 | Disciplinary process | Org-level policy (not in codebase) | — |
| A.6.5 | Responsibilities after termination | Vault key revocation, credential rotation | `docs/runbooks/key-compromise.md` |
| A.6.6 | Confidentiality agreements | Org-level, reinforced via technical controls | — |
| A.6.7 | Remote working | mTLS + VPN required for remote access | — |
| A.6.8 | Information security event reporting | PagerDuty, Slack alerts, Loki log alerts | `docs/runbooks/incident-response.md:31` |

## A.7 — Physical Controls

| Ref | Control Name | Implementation | Evidence Location |
|-----|-------------|---------------|-------------------|
| A.7.1 | Physical security perimeter | AWS data center controls (shared responsibility) | — |
| A.7.2 | Physical entry controls | AWS IAM + VPC + security groups | `deploy/terraform/` |
| A.7.3 | Securing offices, rooms, facilities | AWS data center compliance (SOC 2 Type II) | — |
| A.7.4 | Physical security monitoring | AWS CloudTrail, GuardDuty | — |
| A.7.5 | Protection against physical threats | Multi-AZ deployment, cross-region DR | `docs/runbooks/disaster-recovery.md` |
| A.7.6 | Working in secure areas | Org-level policy | — |
| A.7.7 | Clear desk and clear screen | N/A (cloud-only infrastructure) | — |
| A.7.8 | Equipment siting and protection | AWS infrastructure | — |
| A.7.9 | Security of assets off-premises | N/A (fully cloud-hosted) | — |
| A.7.10 | Storage media | RDS EBS encryption, S3 SSE-KMS | `docs/SECURITY.md:107` |
| A.7.11 | Supporting utilities | Multi-AZ, redundant network paths | `deploy/terraform/` |
| A.7.12 | Cabling security | AWS managed | — |
| A.7.13 | Equipment maintenance | Automated via Terraform + Helm | `deploy/terraform/` |
| A.7.14 | Secure disposal | S3 object versioning + lifecycle policies | — |

## A.8 — Technological Controls

| Ref | Control Name | Implementation | Evidence Location |
|-----|-------------|---------------|-------------------|
| A.8.1 | User endpoint devices | N/A (API-only, no endpoints) | — |
| A.8.2 | Privileged access rights | Vault admin tokens, KMS key policies | `docs/DEPLOYMENT.md:127` |
| A.8.3 | Information access restriction | JWT claims with kyc_tier and permissions | `docs/SECURITY.md:95` |
| A.8.4 | Access to source code | GitHub protected branches, signed commits | `.github/workflows/ci.yml` |
| A.8.5 | Secure authentication | mTLS + JWT + API keys | `docs/SECURITY.md:73` |
| A.8.6 | Capacity management | HPA, resource limits, K6 load tests | `charts/kyc-vault/`, `tests/load/` |
| A.8.7 | Protection against malware | Trivy container scanning, Semgrep SAST | `.github/workflows/security-scan.yml` |
| A.8.8 | Management of technical vulnerabilities | Dependabot, cargo-audit, weekly OWASP ZAP | `.github/workflows/security-scan.yml` |
| A.8.9 | Configuration management | GitOps with Helm, config via PR | `charts/kyc-vault/` |
| A.8.10 | Information deletion | Data retention scheduler, credential revocation | `docs/compliance/retention-policy.md` |
| A.8.11 | Data masking | Selective disclosure via ZKPs, TEE processing | `circuits/noir/src/` |
| A.8.12 | Data leakage prevention | Tetragon eBPF monitoring, network policies | `deploy/tetragon/tracing_policy.yaml` |
| A.8.13 | Information backup | Daily pg_dump, WAL archiving, S3 cross-region replication | `docs/runbooks/disaster-recovery.md:67` |
| A.8.14 | Redundancy of information processing | Multi-AZ, multi-replica, Patroni HA | `charts/kyc-vault/` |
| A.8.15 | Logging | Structured JSON logging via tracing + OpenTelemetry | `opentelemetry-collector.yml` |
| A.8.16 | Monitoring activities | Prometheus + Grafana + Loki | `deploy/prometheus/alerts.yml` |
| A.8.17 | Clock synchronization | NTP via EKS worker node config | — |
| A.8.18 | Use of privileged utility programs | Restricted to CI/CD only, audit logged | `.github/workflows/` |
| A.8.19 | Installation of software on operational systems | Immutable containers, no runtime installs | `Dockerfile` |
| A.8.20 | Networks security | Cilium zero-trust network policies | `deploy/tetragon/network_policy.yaml` |
| A.8.21 | Security of network services | WAF, rate limiting, mTLS | `docs/SECURITY.md:84` |
| A.8.22 | Segregation of networks | Kubernetes namespaces, network policies | `deploy/tetragon/network_policy.yaml` |
| A.8.23 | Web filtering | WAF with OWASP rules | `deploy/terraform/` |
| A.8.24 | Use of cryptography | PQC (ML-KEM, ML-DSA, SLH-DSA), HPKE, AES-256-GCM | `docs/SECURITY.md:8` |
| A.8.25 | Secure development lifecycle | Git flow, linting, testing, SAST, DAST | `.github/workflows/ci.yml` |
| A.8.26 | Application security requirements | OWASP Top 10 Robot Framework tests | `tests/robot/owasp_top10.robot` |
| A.8.27 | Secure system architecture | Defense-in-depth: 9 layers | `docs/ARCHITECTURE.md:108` |
| A.8.28 | Secure coding | Rust unsafe code denied, Clippy with -D warnings | `Cargo.toml:13`, `justfile:54` |
| A.8.29 | Security testing in development | Fuzz testing (cargo-fuzz, Jazzer.js) | `tests/fuzz/` |
| A.8.30 | Outsourced development | N/A (in-house development) | — |
| A.8.31 | Separation of development, test, production | Distinct environments via Helm values | `charts/kyc-vault/values.yaml` |
| A.8.32 | Change management | PR + CI/CD + Helm rollback | `.github/workflows/ci.yml` |
| A.8.33 | Test information | Sandbox test data, no PII in tests | `tests/` |
| A.8.34 | Protection of information systems during audit | Read-only audit access, S3 immutable logs | `docs/compliance/retention-policy.md` |

## Internal Control Traceability

```
SOC 2 Controls ──────► ISO 27001 Controls ──────► Implementation
    CC6.1                    A.8.2, A.8.3               JWT + mTLS + RBAC
    CC6.6                    A.8.24                      PQC Encryption
    CC7.2                    A.8.15, A.8.16              OTEL + Grafana
    CC7.3                    A.5.24, A.5.25              Incident Response
    CC8.1                    A.8.32                      CI/CD + Helm
    P1.1-P1.8                A.5.34                      ZKP + Consent
```

## Audit Evidence Repository

| ISO Ref | Evidence | Format | Location |
|---------|----------|--------|----------|
| A.5.24 | Incident report | Markdown | `docs/runbooks/incident-response.md` |
| A.8.8 | Vulnerability scan report | SARIF | `.github/workflows/security-scan.yml` |
| A.8.15 | Sample logs | JSON | Loki query result examples |
| A.8.24 | Crypto configuration | Configmap | `charts/kyc-vault/values.yaml` |
| A.8.25 | CI/CD pipeline run | YAML | `.github/workflows/ci.yml` |
