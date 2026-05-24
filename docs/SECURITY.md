# Security Documentation

## Overview

KYC Vault implements a defense-in-depth security architecture spanning cryptographic, infrastructure, application, and operational security controls. This document details all security measures implemented across the platform.

## Cryptographic Controls

### Post-Quantum Cryptography (FIPS 203, 204, 205)

| Algorithm | Standard | Key Size | Use Case |
|-----------|----------|----------|----------|
| ML-KEM-768 (Kyber) | FIPS 203 | 1184B pk / 2400B sk | KEM for credential encryption |
| ML-DSA-65 (Dilithium) | FIPS 204 | 1952B pk / 4000B sk | Credential signatures |
| SLH-DSA-SHAKE-128s (SPHINCS+) | FIPS 205 | 64B pk / 128B sk | Long-term document signing |
| FN-DSA-512 (FALCON) | NIST IR 8459 | 897B pk / 1281B sk | Compact proofs |

### Hybrid Cryptography

```text
Credential Encryption = HPKE (AES-256-GCM + ECDH P-384)
                      + ML-KEM-768 (post-quantum KEM)

Credential Signatures = ECDSA P-384 (classical)
                      + ML-DSA-65 (post-quantum)
```

### Secret Sharing (Shamir)

- Threshold: 3-of-5 shares
- Modulus: 2^127 - 1 (Mersenne prime)
- Used for: Master key recovery, HSM key escrow

## Infrastructure Security

### Network Security (Cilium)

```
┌──────────────────────────────────────────────────┐
│ Zero-Trust Network Policies                       │
├──────────────────────────────────────────────────┤
│ Deny-all ingress/egress as default                │
│ Explicit allow rules for service communication    │
│ No direct internet access for data-plane services │
│ mTLS required for inter-service communication     │
└──────────────────────────────────────────────────┘
```

### Process Monitoring (Tetragon)

```
Monitored syscalls:
- execve (process execution tracking)
- openat (file access monitoring)
- connect/bind (network connection tracking)
- ptrace (debugging prevention)
- setcap (capability escalation detection)
```

### TLS Configuration

```text
Min Protocol: TLS 1.3
Cipher Suites: TLS_AES_256_GCM_SHA384
               TLS_CHACHA20_POLY1305_SHA256
Certificate: ECDSA P-384 (via cert-manager)
Renewal: 30 days before expiry
mTLS: Required for gRPC and inter-service communication
```

## Application Security

### Input Validation (Zod)

```typescript
// All API inputs validated with Zod schemas
const DocumentSchema = z.object({
  documentId: z.string().uuid(),
  imageData: z.string().max(10_000_000),
  documentType: z.enum(['passport', 'drivers_license', ...]),
});
```

### Rate Limiting

```text
Per-endpoint: 30 req/min (AI endpoints)
               100 req/s (general API)
              1000 req/s (internal services)
Burst:    2x base rate
Window:  60s sliding
```

### API Authentication

```text
Method: Bearer JWT + mTLS
JWT Claims: sub, iss, iat, exp, kyc_tier, permissions
mTLS: Required for gRPC (internal) endpoints
API Keys: HMAC-SHA256 signed tokens
```

## Data Protection

### Encryption at Rest

| Storage | Method | Key Management |
|---------|--------|----------------|
| RDS PostgreSQL | AES-256 | AWS KMS (customer managed) |
| S3 | AES-256 (SSE-KMS) | AWS KMS |
| ElastiCache Redis | Encryption enabled | AWS KMS |
| MSK Kafka | TLS + encryption | AWS KMS + IAM |
| Iceberg (S3) | AES-256 (SSE-KMS) + ZSTD | AWS KMS |

### Encryption in Transit

```text
External API: TLS 1.3 with ECDSA P-384
Internal gRPC: mTLS with ECDSA P-384
Database: TLS 1.3 (RDS enforced)
Redis: TLS + AUTH token
Kafka: TLS + IAM SASL/SCRAM
```

### TEE (Trusted Execution Environment)

- Teaclave functions run inside Intel SGX enclaves
- All credential data decrypted and processed inside TEE
- Remote attestation via Intel IAS
- Memory zeroed on function completion

### Wasm Sandboxing

```text
Runtime: Wasmtime with fuel metering
Fuel Limit: 1,000,000 units per execution
Memory Limit: 10 MB per instance
Instance Limit: 100 simultaneous
Host Functions: Limited to log, get_credential, verify_proof, emit_event
```

## Compliance Controls

### SOC 2 Controls

| Control | Implementation |
|---------|---------------|
| CC6.1 (Logical Access) | JWT + mTLS + RBAC |
| CC6.6 (Encryption) | AES-256 + TLS 1.3 + PQC |
| CC7.2 (Monitoring) | Tetragon + Prometheus + Loki |
| CC7.3 (Incident Response) | Automated alerts + runbooks |
| CC8.1 (Change Management) | GitOps + CI/CD + approvals |

### GDPR Controls

| Right | Implementation |
|-------|---------------|
| Right to Access | GET /v1/credentials/:id |
| Right to Erasure | DELETE /v1/credentials/:id |
| Right to Portability | Export API (JSON-LD) |
| Data Minimization | Selective disclosure via ZKPs |
| Consent Management | Granular consent tokens |

## Security Operations

### Incident Response

1. **Detection**: Prometheus alerts, Loki log alerts, Tetragon events
2. **Triage**: On-call engineer receives PagerDuty notification
3. **Containment**: Network policy isolation, pod scaling
4. **Eradication**: Rotate secrets via Vault, patch deployment
5. **Recovery**: Rollback via Helm, restore from backup
6. **Post-mortem**: Document in runbooks, update policies

### Backup & Recovery

```text
Database: Daily full backup, WAL streaming (RDS automated)
S3: Cross-region replication for audit bucket
Vault: Auto-unseal with KMS, backup of unseal keys
Kubernetes: Velero for cluster backup
DR: Multi-region deployment (future)
```

### Security Scanning

```text
SAST: Semgrep (custom rules + OWASP top 10)
DAST: OWASP ZAP (scheduled weekly)
Fuzz: cargo-fuzz (Rust), Jazzer.js (TypeScript)
Dependency: Dependabot + npm audit + cargo audit
Container: Trivy (image scanning in CI/CD)
