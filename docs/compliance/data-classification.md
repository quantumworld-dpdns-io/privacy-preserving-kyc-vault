# Data Classification Policy

## Classification Levels

The KYC Vault platform classifies all data into five sensitivity levels. Classification is enforced at the schema level via `SensitivityLevel` enum and at the application level through access controls, encryption requirements, and handling procedures.

| Level | Label | Definition | Examples |
|-------|-------|------------|----------|
| L0 | Public | No harm if disclosed | API documentation, public DID documents, circuit parameters |
| L1 | Low | Minor operational impact | Service logs (non-PII), anonymous metrics, performance data |
| L2 | Medium | Moderate business impact | Platform config, API key hashes, encrypted audit trails |
| L3 | High | Significant privacy/business risk | Identity document hashes, verification decisions, risk scores |
| L4 | Critical | Severe harm if compromised | Raw identity documents, biometric data, private keys |

## Data Inventory by Classification

### L0 — Public

| Data Type | Storage | Access Control | Encryption |
|-----------|---------|---------------|------------|
| Public DID documents | RDS | Public read | None required |
| Circuit proving params | S3 (public bucket) | Public read | None required |
| Verification keys | S3 / Configmap | Public read | None required |
| API documentation | GitHub pages | Public read | None |

### L1 — Low

| Data Type | Storage | Access Control | Encryption |
|-----------|---------|---------------|------------|
| Application logs (non-PII) | Loki (S3 backend) | Internal team | None at rest |
| Prometheus metrics | Prometheus TSDB | Internal team | None at rest |
| Kafka consumer offsets | Kafka internal topics | Service accounts | None |
| Performance traces | OpenTelemetry collector | Internal team | TLS in transit |
| Anonymized error reports | S3 | Internal team | SSE-S3 |

### L2 — Medium

| Data Type | Storage | Access Control | Encryption |
|-----------|---------|---------------|------------|
| Platform configurations | RDS | Platform admin only | AES-256 (SSE-KMS) |
| API key hashes (SHA-256) | RDS | Service accounts | AES-256 (SSE-KMS) |
| Audit log index | RDS | Security team | AES-256 (SSE-KMS) |
| Webhook URLs | RDS | Platform admin | AES-256 (SSE-KMS) |
| Consent tokens (scope only) | RDS | Subject + platform | AES-256 (SSE-KMS) |

### L3 — High

| Data Type | Storage | Access Control | Encryption |
|-----------|---------|---------------|------------|
| Credential issuance records | RDS | Subject + issuer | AES-256 (SSE-KMS) |
| Verification decisions | RDS | Subject + platform | AES-256 (SSE-KMS) |
| ZKP proof data (public inputs) | RDS / S3 | Subject only | PQC (ML-KEM-768) |
| Document hashes (SHA-256) | RDS | Internal services | AES-256 (SSE-KMS) |
| KYC workflow history | RDS | Subject + reviewer | AES-256 (SSE-KMS) |
| Fraud risk scores | RDS | Compliance team | AES-256 (SSE-KMS) |
| Revocation lists | RDS | Public (verification) | AES-256 (SSE-KMS) |
| Iceberg data lake snapshots | S3 (Iceberg) | Analytics team | AES-256 (SSE-KMS) + ZSTD |

### L4 — Critical

| Data Type | Storage | Access Control | Encryption |
|-----------|---------|---------------|------------|
| Identity document images | TEE (in-memory only) | Never persisted | HPKE (AES-256-GCM + ECDH P-384) + ML-KEM-768 |
| Biometric data (liveness frames) | TEE (in-memory only) | Never persisted | In-memory only, zeroed on completion |
| Private keys (signing) | Vault transit engine | Vault policy restricted | Vault auto-unseal + KMS |
| Private keys (TLS) | cert-manager secrets | Service accounts | Encrypted at pod level |
| Master encryption keys | AWS KMS | KMS key policy | FIPS 140-3 HSM backed |
| Database connection strings | Vault dynamic secrets | Per-pod lease | TLS + Vault wrap |
| Vault root tokens | Shamir shards (3-of-5) | Human admins only | Split across HSM + KMS |

## Handling Requirements

### L0 — Public

No special handling required. May be publicly accessible.

### L1 — Low

- Access: Any authenticated service account
- Transport: TLS recommended, not required
- Retention: 90 days maximum
- Deletion: Standard S3 lifecycle

### L2 — Medium

- Access: Role-based, explicit authorization
- Transport: TLS 1.3 mandatory
- Retention: Per retention schedule (1-7 years)
- Deletion: Cryptographic erasure via KMS key deletion
- Audit: Access logged in structured audit trail

### L3 — High

- Access: Need-to-know + role-based + mTLS
- Transport: TLS 1.3 + mTLS mandatory
- At rest: AES-256 (SSE-KMS) + PQC envelope encryption
- Retention: Per retention policy (90 days post-purpose)
- Deletion: Cryptographic erasure + overwrite
- Audit: Every access logged immutably to S3
- Breach notification: DPO notified within 24 hours

### L4 — Critical

- Access: Strict need-to-know, Vault-managed, mTLS required
- Transport: TLS 1.3 + mTLS + PQC hybrid (ML-KEM-768)
- At rest: Never persisted where possible; if persisted: PQC + AES-256-GCM + KMS
- Processing: TEE enclave only (Teaclave SGX/SEV)
- Retention: Not stored; processed in-memory and zeroed
- Deletion: Memory zeroing + TEE attestation verification
- Audit: Every access + attempted access logged with full context
- Breach notification: CISO + DPO + Legal immediately

## Access Control Matrix

```
           │ Public │ Internal │ Service │ Platform │ Subject │ Admin │
───────────┼────────┼──────────┼─────────┼──────────┼─────────┼───────┤
L0 — Public│   R    │    R     │    R    │    R     │    R    │  R/W  │
L1 — Low   │   —    │    R     │    R    │    R     │    —    │  R/W  │
L2 — Medium│   —    │    —     │    R    │    R     │    R    │  R/W  │
L3 — High  │   —    │    —     │   R/W   │   R/W    │    R    │  R/W  │
L4 — Crit  │   —    │    —     │    —    │    —     │    —    │   W   │
```

- **Public**: Unauthenticated users
- **Internal**: Any authenticated team member
- **Service**: Internal microservice (mTLS)
- **Platform**: Integrated platform (API key)
- **Subject**: Data subject (JWT with DID)
- **Admin**: System administrator (Vault + K8s RBAC)
- **R**: Read access
- **W**: Write access
- **R/W**: Read and write access

## Encryption Standards by Data State

| State | Standard | Minimum Key Length |
|-------|----------|-------------------|
| In transit (external) | TLS 1.3 | ECDSA P-384 |
| In transit (internal) | mTLS 1.3 | ECDSA P-384 |
| At rest (database) | AES-256-GCM (SSE-KMS) | 256 bits |
| At rest (object storage) | AES-256 (SSE-KMS) | 256 bits |
| At rest (cache) | Redis AUTH + TLS | 256 bits |
| At rest (queue) | Kafka TLS + IAM SASL/SCRAM | 256 bits |
| Envelope encryption | PQC ML-KEM-768 + HPKE | 768 bits (PQ) |
| Application-level | BBS+ selective disclosure | 256 bits (ECC) |

## Labeling and Tagging

All data MUST carry classification metadata:

```json
{
  "sensitivity": "high",
  "classification": "L3",
  "handling": ["tls-required", "encrypted-at-rest", "audit-logged"],
  "retention_days": 90,
  "data_owner": "security@kyc-vault.com"
}
```

Classification is applied via schema attributes:

```rust
SchemaAttribute {
    name: "document_image".into(),
    sensitivity: Some(SensitivityLevel::Critical),
    classification: DataClassification::L4,
    retention: Some(Duration::from_days(90)),
}
```

## Compliance Cross-Reference

| Classification | GDPR | SOC 2 | ISO 27001 |
|---------------|------|-------|-----------|
| L0 — Public | Art. 5(1)(c) excluded | CC6.1 | A.5.12 |
| L1 — Low | Art. 5(1)(e) | A1.3 | A.8.15 |
| L2 — Medium | Art. 5(1)(f) | CC6.6 | A.8.24 |
| L3 — High | Art. 25, 32 | CC6.6, C1.2 | A.8.11, A.8.24 |
| L4 — Critical | Art. 25, 28, 32 | C1.1, P1.3 | A.5.34, A.8.11 |
