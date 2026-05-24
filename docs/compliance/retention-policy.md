# Data Retention Policy

## Overview

This policy defines retention schedules, deletion procedures, and legal hold processes for all data categories in the KYC Vault platform. Retention is enforced through automated lifecycle policies, scheduled purge jobs, and manual review processes.

## Retention Schedules by Data Category

### Identity Verification Data

| Data Type | Classification | Active Retention | Archive Retention | Total Retention | Legal Basis |
|-----------|---------------|-----------------|-------------------|-----------------|-------------|
| Identity document images | L4 — Critical | 90 days post-verification | None (not archived) | 90 days | Consent (GDPR Art. 7) |
| Liveness challenge video | L4 — Critical | 30 days | None | 30 days | Consent (GDPR Art. 7) |
| Biometric embeddings | L4 — Critical | 0 (in-memory only) | None | 0 — not persisted | Consent (GDPR Art. 7) |
| OCR extracted data | L3 — High | 90 days post-verification | 1 year | 1 year + 90 days | Consent + Legitimate interest |

### Credential Data

| Data Type | Classification | Active Retention | Archive Retention | Total Retention | Legal Basis |
|-----------|---------------|-----------------|-------------------|-----------------|-------------|
| Verifiable credentials | L3 — High | Until expiry + 90 days | 1 year | Credential expiry + 1 year | Consent (GDPR Art. 7) |
| Credential status (revocation) | L3 — High | Until all subjects expired | 7 years (audit) | 7 years | Legal obligation |
| Presentation proofs | L3 — High | 30 days | 1 year | 1 year + 30 days | Legitimate interest |

### KYC Workflow Data

| Data Type | Classification | Active Retention | Archive Retention | Total Retention | Legal Basis |
|-----------|---------------|-----------------|-------------------|-----------------|-------------|
| Workflow state history | L3 — High | 90 days post-completion | 3 years | 3 years + 90 days | Consent + Legal obligation |
| Review decisions | L3 — High | 90 days post-decision | 3 years | 3 years + 90 days | Consent + Legal obligation |
| Fraud risk assessments | L3 — High | 90 days | 5 years | 5 years + 90 days | Legal obligation (AML) |
| AML screening results | L3 — High | 90 days | 5 years | 5 years + 90 days | Legal obligation (AML) |

### Platform Configuration

| Data Type | Classification | Active Retention | Archive Retention | Total Retention | Legal Basis |
|-----------|---------------|-----------------|-------------------|-----------------|-------------|
| Platform configurations | L2 — Medium | Active + 90 days | 3 years post-termination | 3 years active | Contractual |
| API key hashes | L2 — Medium | Active + 30 days | 3 years post-revocation | 3 years active | Security |
| Webhook configurations | L2 — Medium | Active + 30 days | 1 year post-removal | 1 year | Contractual |
| Consent tokens | L2 — Medium | Active + duration of consent | 7 years | Active + 7 years | Legal obligation |

### System Data

| Data Type | Classification | Retention | Rationale |
|-----------|---------------|-----------|-----------|
| Application logs | L1 — Low | 90 days | Operational debugging |
| Audit logs (immutable) | L2 — Medium | 7 years | Regulatory compliance |
| Prometheus metrics | L1 — Low | 90 days | Performance monitoring |
| Traces (OpenTelemetry) | L1 — Low | 30 days | Debugging |
| Kafka events | L2 — Medium | 7 days | Message replay capacity |
| Database backups | L2 — Medium | 30 days (daily) + 1 year (weekly) | Disaster recovery |
| WAL archives | L2 — Medium | 7 days | Point-in-time recovery |

## Automated Deletion Procedures

### Credential Expiry Purge

Scheduled via cron job (daily at 02:00 UTC):

```bash
# scripts/purge/expired_credentials.sh
#!/bin/bash
set -euo pipefail

DB_URL=$1
DRY_RUN=${2:-false}

echo "Purging expired credentials at $(date -u)"

EXPIRED_CREDS=$(psql $DB_URL -t -A -c "
  UPDATE credentials
  SET status = 'expired',
      deleted_at = NOW()
  WHERE expiration_date < NOW()
    AND status != 'expired'
    AND status != 'revoked'
    AND legal_hold = false
  RETURNING credential_id;
" | wc -l)

# If not dry run, cascade to associated records
if [ "$DRY_RUN" = false ]; then
  psql $DB_URL -c "
    DELETE FROM credential_subject_claims
    WHERE credential_id IN (
      SELECT credential_id FROM credentials
      WHERE deleted_at IS NOT NULL
        AND deleted_at < NOW() - INTERVAL '90 days'
    );
  "
fi

echo "Purged $EXPIRED_CREDS expired credentials"
```

### Identity Document Purge

Scheduled via cron job (daily at 03:00 UTC):

```bash
# scripts/purge/identity_documents.sh
#!/bin/bash
set -euo pipefail

DB_URL=$1

echo "Purging identity documents at $(date -u)"

# Soft-delete documents past retention
psql $DB_URL -c "
  UPDATE kyc_documents
  SET status = 'purged',
      purged_at = NOW()
  WHERE status IN ('verified', 'rejected')
    AND verified_at < NOW() - INTERVAL '90 days'
    AND legal_hold = false;
"

# Delete S3 objects for purged documents
aws s3 rm s3://kyc-vault-credentials/documents/ \
  --recursive \
  --exclude "*" \
  --include "*.enc" \
  --include "*.meta" \
  --older-than 90d

echo "Document purge complete"
```

### Log Rotation

```bash
# Loki retention is configured via compactor:
# loki-config.yaml
compactor:
  retention_enabled: true
  retention_rules:
    - selector: '{app="api-gateway"}'
      period: 90d
    - selector: '{app="audit"}'
      period: 7y
```

### Backup Lifecycle (S3)

```hcl
# S3 lifecycle policy
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  rule {
    id     = "daily_backup_expiry"
    status = "Enabled"
    filter {
      prefix = "database/"
    }
    expiration {
      days = 30
    }
    transition {
      days          = 7
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 14
      storage_class = "GLACIER"
    }
  }

  rule {
    id     = "weekly_backup_expiry"
    status = "Enabled"
    filter {
      prefix = "database/weekly/"
    }
    expiration {
      days = 365
    }
  }
}
```

## Deletion Verification

All purge operations produce audit records:

```sql
INSERT INTO deletion_audit (
  deleted_at, data_category, record_count,
  verified_by, verification_hash
) VALUES (
  NOW(), 'expired_credentials', 42,
  'system_purge_job',
  sha256('expired_credentials:42:' || NOW())
);
```

Verification queries run post-purge:

```bash
# Verify credential table integrity post-purge
psql $DB_URL -c "
  SELECT data_category,
         COUNT(*) as records_purged,
         MIN(deleted_at) as earliest,
         MAX(deleted_at) as latest
  FROM deletion_audit
  WHERE deleted_at > NOW() - INTERVAL '24 hours'
  GROUP BY data_category;
"
```

## Legal Hold Process

When a legal hold is required (litigation, regulatory investigation, subpoena):

### 1. Legal Hold Notification

```bash
# Apply legal hold to specific subject(s)
curl -X POST https://api.kyc-vault.com/v1/compliance/legal-hold \
  -H "Authorization: Bearer $COMPLIANCE_TOKEN" \
  -d '{
    "reason": "subpoena-2026-05-24",
    "subject_dids": ["did:kyc:subject:def456"],
    "data_categories": ["credentials", "verifications", "audit_logs"],
    "hold_until": "2027-05-24T00:00:00Z",
    "authorized_by": "legal@kyc-vault.com"
  }'
```

### 2. Override Automatic Purge

```bash
# Database: set legal_hold flag
psql $DB_URL -c "
  UPDATE credentials
  SET legal_hold = true,
      legal_hold_reason = 'subpoena-2026-05-24',
      legal_hold_until = '2027-05-24T00:00:00Z'
  WHERE credential_subject_id IN ('did:kyc:subject:def456');
"

# S3: add legal hold tag to objects
aws s3api put-object-legal-hold \
  --bucket kyc-vault-credentials \
  --key documents/${subject_id}/passport.enc \
  --legal-hold Status=ON

# Prevent lifecycle policy from deleting held objects
aws s3api put-object-retention \
  --bucket kyc-vault-credentials \
  --key documents/${subject_id}/passport.enc \
  --retention '{"Mode":"GOVERNANCE","RetainUntilDate":"2027-05-24T00:00:00Z"}'
```

### 3. Legal Hold Dashboard

```bash
# List all active legal holds
psql $DB_URL -c "
  SELECT legal_hold_reason,
         COUNT(*) as subject_count,
         MIN(legal_hold_until) as earliest_expiry
  FROM credentials
  WHERE legal_hold = true
  GROUP BY legal_hold_reason;
"

# Review held data access logs
logcli query '{app="audit"} |= "legal_hold" |= "subpoena-2026-05-24"' --since=24h
```

### 4. Legal Hold Release

```bash
# Release legal hold
curl -X DELETE https://api.kyc-vault.com/v1/compliance/legal-hold/subpoena-2026-05-24 \
  -H "Authorization: Bearer $COMPLIANCE_TOKEN" \
  -d '{
    "released_by": "legal@kyc-vault.com",
    "release_reason": "hold_period_expired",
    "release_date": "2027-05-24T00:00:00Z"
  }'

# Remove database flags
psql $DB_URL -c "
  UPDATE credentials
  SET legal_hold = false,
      legal_hold_reason = NULL,
      legal_hold_until = NULL
  WHERE legal_hold_reason = 'subpoena-2026-05-24';
"

# Remove S3 legal holds
aws s3api delete-object-legal-hold \
  --bucket kyc-vault-credentials \
  --key documents/${subject_id}/passport.enc
```

## Deletion Confirmation

For GDPR Article 17 (Right to Erasure) requests, a confirmation report is generated:

```json
{
  "erasure_request_id": "erasure-20260524-001",
  "subject_did": "did:kyc:subject:def456",
  "requested_at": "2026-05-24T10:00:00Z",
  "completed_at": "2026-05-24T10:00:42Z",
  "data_categories_erased": [
    {"category": "credentials", "records": 3},
    {"category": "verifications", "records": 12},
    {"category": "kyc_documents", "records": 1}
  ],
  "data_categories_retained": [
    {"category": "audit_logs", "reason": "legal_obligation_7yr_retention"},
    {"category": "fraud_risk_assessments", "reason": "aml_compliance"}
  ],
  "verification_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
}
```

## Compliance Cross-Reference

| Regulation | Retention Requirement | KYC Vault Implementation |
|------------|----------------------|--------------------------|
| GDPR Art. 5(1)(e) | No longer than necessary | Configurable per-purpose retention |
| GDPR Art. 17 | Right to erasure | Credential revocation + document purge |
| GDPR Art. 32 | Security of processing | Encrypted deletion + verified purge |
| AML Directive | 5 years post-business relationship | Fraud assessments retained 5 years |
| SOC 2 CC6.6 | Secure disposal | Cryptographic erasure via KMS |
| SOC 2 P1.4 | Retention limits | Automated purge scheduler |
| ISO 27001 A.8.10 | Information deletion | Legal hold + automated deletion |
| ISO 27001 A.8.13 | Backup retention | 30d daily + 1yr weekly backups |
