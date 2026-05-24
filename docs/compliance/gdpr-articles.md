# GDPR Compliance Mapping

## Scope

This document maps GDPR requirements to technical controls implemented in the KYC Vault platform. The system processes personal data as part of identity verification workflows. KYC Vault acts as both a data processor (processing identity documents on behalf of platforms) and a data controller (managing credential lifecycle).

## Article 5 — Principles Relating to Processing of Personal Data

| Principle | Requirement | Implementation |
|-----------|-------------|----------------|
| 5(1)(a) — Lawfulness, fairness, transparency | Process data lawfully and transparently | Consent tokens presented to subject at KYC initiation; granular scope-based permissions in `PlatformConfig.consent_required` |
| 5(1)(b) — Purpose limitation | Collect for specified purposes only | Credential types restricted to platform's `allowed_credential_types`; data classification schema enforces purpose binding |
| 5(1)(c) — Data minimization | Adequate, relevant, limited to what is necessary | ZKP selective disclosure proves claims without revealing raw data; Noir circuits prove age without DOB |
| 5(1)(d) — Accuracy | Ensure data accuracy | Document verification + liveness check + human review workflow; credential re-issuance on update |
| 5(1)(e) — Storage limitation | Keep no longer than necessary | Retention schedules per data category; automated purge via `expiration_date` on credentials |
| 5(1)(f) — Integrity and confidentiality | Appropriate security of personal data | PQC encryption (ML-KEM-768), TLS 1.3, TEE enclave processing, Wasm sandboxing |
| 5(2) — Accountability | Demonstrate compliance | Audit logs in S3 immutable bucket; OpenTelemetry tracing; all data access logged |

## Article 7 — Conditions for Consent

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| 7(1) — Consent must be unambiguous | `ConsentToken` with specific scope + platform_id + subject_did | `crates/core/src/platform.rs:28` |
| 7(2) — Withdrawal must be as easy as given | `DELETE /v1/credentials/:id` and revocation list | `crates/core/src/credential.rs`, `crates/core/src/status.rs` |
| 7(3) — Right to withdraw consent | Platform API for consent revocation | `crates/core/src/platform.rs:28` |
| 7(4) — Freely given consent | Platform verification required; auto-approve is opt-in only | `PlatformConfig.auto_approve` default false |

## Article 15 — Right of Access by the Data Subject

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| 15(1)(a) — Confirmation of processing | `GET /v1/credentials/:id` returns credential status | `docs/API.md:75` |
| 15(1)(b) — Access to personal data | Full credential data returned via API | `crates/core/src/credential.rs` |
| 15(1)(c) — Recipients of data | Presentation history shows which platforms verified which credentials | `crates/core/src/presentation.rs` |
| 15(1)(d) — Retention period | Expiration date on credential, configurable per platform | `VerifiableCredential.expiration_date` |
| 15(1)(h) — Existence of automated decision-making | AML screening, fraud detection are human-reviewable | `crates/core/src/kyc/workflow.rs:10` |

API Implementation:
```bash
# Subject requests access to their data
curl -X GET https://api.kyc-vault.com/v1/credentials \
  -H "Authorization: Bearer $SUBJECT_TOKEN" \
  -H "X-Access-Request: true"

# Response includes all credentials and their processing history
```

## Article 16 — Right to Rectification

| Requirement | Implementation |
|-------------|---------------|
| Correct inaccurate data | Credential re-issuance via `POST /v1/credentials/reissue`; old credential placed on revocation list |
| Complete incomplete data | KYC workflow supports `AdditionalInfoRequested` state for supplemental data |

## Article 17 — Right to Erasure (Right to be Forgotten)

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| 17(1)(a) — Data no longer necessary | Credential expires automatically; configurable TTL | `VerifiableCredential.is_expired()` |
| 17(1)(b) — Withdrawal of consent | Consent revocation triggers credential revocation | `PlatformConfig.consent_required` |
| 17(1)(c) — Objection to processing | Subject can object via platform; triggers review workflow | — |
| 17(1)(d) — Unlawful processing | Audit log review detects unauthorized processing | `docs/runbooks/key-compromise.md` |
| 17(2) — Publicly disseminated data | N/A (credentials are not publicly disseminated) | — |
| 17(3) — Exceptions (legal obligation) | Retention holds for legal/regulatory obligations | `docs/compliance/retention-policy.md` |

Erasure API:
```bash
# Full erasure request
DELETE /v1/credentials/:id?reason=gdpr_erasure&cascade=true

# System response:
# - Credential added to revocation list
# - Encrypted data marked for deletion
# - Audit log entry preserved (immutable)
# - Cascade removes associated verification records
```

## Article 20 — Right to Data Portability

| Requirement | Implementation |
|-------------|---------------|
| 20(1) — Receive data in structured, machine-readable format | Credential export as JSON-LD (W3C Verifiable Credential format) |
| 20(1) — Right to transmit to another controller | `GET /v1/credentials/:id/export` returns full VC in standard format |
| 20(2) — Direct transmission between controllers | Presentation protocol allows credential transfer via VP |

Data Portability API:
```bash
# Export credential in portable format
curl -X GET https://api.kyc-vault.com/v1/credentials/550e8400-e29b-41d4-a716-446655440000/export \
  -H "Authorization: Bearer $SUBJECT_TOKEN"

# Response format: W3C Verifiable Credential JSON-LD
# {
#   "@context": ["https://www.w3.org/2018/credentials/v1"],
#   "type": ["VerifiableCredential"],
#   "credentialSubject": {
#     "id": "did:kyc:subject:def456"
#   },
#   "proof": { ... }
# }
```

## Article 25 — Data Protection by Design and by Default

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| 25(1) — Data protection by design | Privacy-enhancing technologies embedded from architecture level: ZKP selective disclosure, TEE processing, PQC encryption | `docs/ARCHITECTURE.md:108`, `docs/adr/ADR-003-zkp-strategy.md` |
| 25(2) — Data protection by default | Minimal data collected by default; subjects must opt-in for additional attributes | `crates/core/src/schema.rs` |
| 25(3) — Certification mechanisms | SOC 2 controls implemented; ISO 27001 mappings maintained | `docs/compliance/soc2-controls.md`, `docs/compliance/iso27001-controls.md` |

Privacy by Design Architecture:
```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Collection   │────►│  ZKP Selective   │────►│  TEE Processing  │
│  Minimization │     │  Disclosure      │     │  (SGX Enclave)   │
└──────────────┘     └──────────────────┘     └─────────────────┘
                           │                          │
                           ▼                          ▼
                    ┌──────────────────┐     ┌─────────────────┐
                    │      PQC         │     │   Immutable     │
                    │   Encryption     │     │   Audit Trail   │
                    └──────────────────┘     └─────────────────┘
```

## Article 28 — Processor

| Requirement | Implementation |
|-------------|---------------|
| 28(1) — Processor shall provide sufficient guarantees | SOC 2 Type II report, ISO 27001 certification (in progress) |
| 28(2) — Processor shall not engage sub-processor without authorization | Third-party sub-processors documented in DPA |
| 28(3)(a) — Process only on documented instructions | Platform config controls processing scope per integration |
| 28(3)(b) — Confidentiality of personnel | Access limited via Vault + IAM roles |
| 28(3)(c) — Appropriate security measures | Defense-in-depth: 9 layers |
| 28(3)(d) — Sub-processor conditions | AWS (sub-processor) with DPA in place |
| 28(3)(e) — Assistance with data subject rights | API endpoints for access, rectification, erasure, portability |
| 28(3)(f) — Assistance with security obligations | Incident response runbook, breach notification procedure |
| 28(3)(g) — Deletion or return of data | Retention policy with data purge schedules |
| 28(3)(h) — Audit rights | Read-only access for auditors, S3 immutable logs |

Data Processing Agreement (DPA) per Platform:
```
Platform Registration → DPA Acceptance → Consent Token Issuance → Processing
```

## Article 32 — Security of Processing

| Requirement | Implementation | Evidence |
|-------------|---------------|----------|
| 32(1)(a) — Pseudonymization | DID-based identity (no direct PII in identifiers) | `crates/did/src/document.rs` |
| 32(1)(b) — Ability to ensure ongoing confidentiality | PQC encryption for data at rest and in transit | `docs/SECURITY.md:8` |
| 32(1)(c) — Ability to restore availability | Disaster recovery with RTO 5min-2hr per service | `docs/runbooks/disaster-recovery.md:9` |
| 32(1)(d) — Regular testing of effectiveness | DR testing schedule, chaos engineering, weekly backup restore tests | `docs/runbooks/disaster-recovery.md:369` |
| 32(2) — Risk-appropriate security level | 9-layer defense-in-depth architecture | `docs/ARCHITECTURE.md:108` |
| 32(3) — Adherence to code of conduct | NIST FIPS 203/204/205 standards | `docs/SECURITY.md:8` |
| 32(4) — Controller/processor verification | SOC 2 Type II, external penetration tests | — |

## Breach Notification Procedure (Arts. 33-34)

```yaml
breach_detected:
  assessment:
    - What data was affected? (data_classification)
    - How many subjects? (blast radius)
    - What is the risk to rights and freedoms?
  notification:
    supervisory_authority:
      deadline: 72 hours (Art. 33)
      channel: DPA notification form
    data_subjects:
      condition: High risk to rights (Art. 34)
      channel: Email + Platform notification
    documentation:
      location: Incident post-mortem record
```

## Data Protection Officer (DPO) Contact

For GDPR-related inquiries: dpo@kyc-vault.com

## Records of Processing Activities (Art. 30)

| Processing Activity | Purpose | Data Categories | Retention | Legal Basis |
|--------------------|---------|----------------|-----------|-------------|
| Identity verification | KYC checks | Identity documents, biometric data | 90 days post-verification | Consent (Art. 7) |
| Credential issuance | Proof of KYC status | Verified attributes only | Until credential expiry | Consent (Art. 7) |
| Fraud detection | AML screening | Risk scores, behavioral data | 5 years | Legal obligation (Art. 6(1)(c)) |
| Audit logging | Compliance monitoring | All processing events | 7 years | Legal obligation (Art. 6(1)(c)) |
